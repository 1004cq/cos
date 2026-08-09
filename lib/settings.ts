import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';

const COS_KEYS = [
  'cos.secretId',
  'cos.secretKey',
  'cos.bucket',
  'cos.region',
  'cos.cdnDomain',
  'cos.thumbWidth',
] as const;

export type CosRuntimeConfig = {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  cdnDomain: string;
  thumbWidth: number;
  /** 配置来源：database | env | mixed */
  source: 'database' | 'env' | 'mixed';
};

function deriveKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET || process.env.SETTINGS_ENCRYPT_KEY || 'cos-dev-insecure-key';
  return createHash('sha256').update(secret).digest();
}

/** 简单 AES-256-GCM 加密，格式 iv:tag:cipher 均为 base64 */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    // 兼容未加密的旧值
    return payload;
  }
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '****';
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

async function getSettingRaw(key: string): Promise<string | null> {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key } });
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * 读取运行时 COS 配置：数据库有值则覆盖 env
 */
export async function getCosConfig(): Promise<CosRuntimeConfig> {
  const [dbId, dbKey, dbBucket, dbRegion, dbCdn, dbThumb] = await Promise.all([
    getSettingRaw('cos.secretId'),
    getSettingRaw('cos.secretKey'),
    getSettingRaw('cos.bucket'),
    getSettingRaw('cos.region'),
    getSettingRaw('cos.cdnDomain'),
    getSettingRaw('cos.thumbWidth'),
  ]);

  let fromDb = 0;
  const secretId = dbId ? (fromDb++, dbId) : process.env.COS_SECRET_ID || '';
  const secretKey = dbKey
    ? (fromDb++, decryptSecret(dbKey))
    : process.env.COS_SECRET_KEY || '';
  const bucket = dbBucket ? (fromDb++, dbBucket) : process.env.COS_BUCKET || '';
  const region = dbRegion ? (fromDb++, dbRegion) : process.env.COS_REGION || '';
  const cdnDomain = dbCdn != null && dbCdn !== ''
    ? (fromDb++, dbCdn)
    : process.env.COS_CDN_DOMAIN || '';
  const thumbWidth = Math.min(
    1200,
    Math.max(
      120,
      parseInt(dbThumb || process.env.COS_THUMB_WIDTH || '480', 10) || 480
    )
  );
  if (dbThumb) fromDb++;

  const source: CosRuntimeConfig['source'] =
    fromDb === 0 ? 'env' : fromDb >= 4 ? 'database' : 'mixed';

  return {
    secretId,
    secretKey,
    bucket,
    region,
    cdnDomain,
    thumbWidth,
    source,
  };
}

/** 给前端的脱敏配置（不返回明文 SecretKey） */
export async function getCosConfigPublic() {
  const c = await getCosConfig();
  return {
    secretId: c.secretId ? maskSecret(c.secretId) : '',
    secretIdSet: Boolean(c.secretId),
    secretKeySet: Boolean(c.secretKey),
    bucket: c.bucket,
    region: c.region,
    cdnDomain: c.cdnDomain,
    thumbWidth: c.thumbWidth,
    source: c.source,
    /** 是否已具备最小可用配置 */
    ready: Boolean(c.secretId && c.secretKey && c.bucket && c.region),
  };
}

export type CosConfigInput = {
  secretId?: string;
  /** 传空或不传表示不修改已有密钥 */
  secretKey?: string;
  bucket?: string;
  region?: string;
  cdnDomain?: string;
  thumbWidth?: number;
};

export async function saveCosConfig(input: CosConfigInput): Promise<void> {
  const upsert = async (key: string, value: string, secret = false) => {
    await prisma.systemSetting.upsert({
      where: { key },
      create: { key, value, secret },
      update: { value, secret },
    });
  };

  if (input.secretId !== undefined && input.secretId.trim()) {
    await upsert('cos.secretId', input.secretId.trim(), true);
  }
  if (input.secretKey !== undefined && input.secretKey.trim()) {
    // 含 **** 的脱敏串视为未修改
    if (!input.secretKey.includes('****')) {
      await upsert('cos.secretKey', encryptSecret(input.secretKey.trim()), true);
    }
  }
  if (input.bucket !== undefined) {
    await upsert('cos.bucket', input.bucket.trim(), false);
  }
  if (input.region !== undefined) {
    await upsert('cos.region', input.region.trim(), false);
  }
  if (input.cdnDomain !== undefined) {
    await upsert('cos.cdnDomain', input.cdnDomain.trim(), false);
  }
  if (input.thumbWidth !== undefined) {
    await upsert('cos.thumbWidth', String(input.thumbWidth), false);
  }
}

export { COS_KEYS, maskSecret };
