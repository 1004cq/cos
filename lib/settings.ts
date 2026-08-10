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

/** 去掉协议与路径，只保留 host */
export function normalizeCdnHost(input: string): string {
  const raw = input.trim();
  if (!raw) return '';
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProto).host;
  } catch {
    return raw.replace(/^https?:\/\//i, '').split('/')[0].trim();
  }
}

/** 中文/IDN 网站域名不能当 COS CDN，否则签名 host 错误导致 404 */
export function isUnsafeCdnHost(host: string): boolean {
  if (!host) return false;
  // 含非 ASCII（如 陈庆.我爱你）
  if (/[^\x00-\x7F]/.test(host)) return true;
  // punycode 中文域（xn--…）同样不能当 COS CDN
  if (host.toLowerCase().includes('xn--')) return true;
  return false;
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
 * 读取运行时 COS 配置：数据库有记录则用数据库（含空字符串=故意清空），
 * 仅当数据库无此 key 时才回退 env。
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

  // 关键：dbCdn === null 才用 env；dbCdn === '' 表示用户已清空，不要回填 env
  let cdnDomain = '';
  if (dbCdn !== null) {
    fromDb++;
    cdnDomain = normalizeCdnHost(dbCdn);
  } else {
    cdnDomain = normalizeCdnHost(process.env.COS_CDN_DOMAIN || '');
  }
  // 运行时忽略不安全的中文 CDN，避免播放/上传 host 错乱
  if (isUnsafeCdnHost(cdnDomain)) {
    cdnDomain = '';
  }

  const thumbWidth = Math.min(
    1200,
    Math.max(
      120,
      parseInt(dbThumb || process.env.COS_THUMB_WIDTH || '480', 10) || 480
    )
  );
  if (dbThumb !== null) fromDb++;

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
  // 展示用：数据库原文（可能含用户误填的中文，便于在表单里看到并清掉）
  const dbCdn = await getSettingRaw('cos.cdnDomain');
  const displayCdn =
    dbCdn !== null
      ? normalizeCdnHost(dbCdn)
      : normalizeCdnHost(process.env.COS_CDN_DOMAIN || '');

  return {
    secretId: c.secretId ? maskSecret(c.secretId) : '',
    secretIdSet: Boolean(c.secretId),
    secretKeySet: Boolean(c.secretKey),
    bucket: c.bucket,
    region: c.region,
    cdnDomain: displayCdn,
    /** 实际签名使用的 CDN（中文域会被忽略） */
    cdnDomainEffective: c.cdnDomain,
    cdnIgnoredUnsafe: Boolean(displayCdn && !c.cdnDomain),
    thumbWidth: c.thumbWidth,
    source: c.source,
    ready: Boolean(c.secretId && c.secretKey && c.bucket && c.region),
  };
}

export type CosConfigInput = {
  secretId?: string;
  secretKey?: string;
  bucket?: string;
  region?: string;
  /** 传空字符串表示清空 CDN */
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
    if (!input.secretId.includes('****')) {
      await upsert('cos.secretId', input.secretId.trim(), true);
    }
  }
  if (input.secretKey !== undefined && input.secretKey.trim()) {
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
    // 允许空字符串：写入 DB，表示明确不使用 CDN，不再回退 env
    let host = normalizeCdnHost(input.cdnDomain);
    // 中文/punycode 站域名一律存空，避免「清空后又被当成有效 CDN」
    if (isUnsafeCdnHost(host)) host = '';
    await upsert('cos.cdnDomain', host, false);
  }
  if (input.thumbWidth !== undefined) {
    await upsert('cos.thumbWidth', String(input.thumbWidth), false);
  }
}

export { COS_KEYS, maskSecret };
