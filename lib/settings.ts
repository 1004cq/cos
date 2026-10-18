import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';

const COS_KEYS = [
  'cos.secretId',
  'cos.secretKey',
  'cos.bucket',
  'cos.region',
  'cos.cdnDomain',
  'cos.thumbWidth',
  'cos.watermarkEnabled',
  'cos.watermarkText',
  'cos.imageStyleThumb',
  'cos.imageStyleFull',
] as const;

export type CosRuntimeConfig = {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  cdnDomain: string;
  thumbWidth: number;
  /** 展示链是否加水印（无法防录屏） */
  watermarkEnabled: boolean;
  watermarkText: string;
  /**
   * 数据万象「样式」名（原图保护开启时，浏览器签名 URL 必须带样式，否则 403 please use style）
   * 缩略图样式；空则使用 imageMogr2 动态处理（原图保护关闭时可用）
   */
  imageStyleThumb: string;
  /** 详情/原图样式；空则签裸对象（原图保护开启时会 403） */
  imageStyleFull: string;
  /** 配置来源：database | env | mixed */
  source: 'database' | 'env' | 'mixed';
};

const DEV_FALLBACK_SECRET = 'cos-dev-insecure-key';
let warnedDevFallback = false;

function hashSecret(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

/**
 * 加密密钥来源（优先独立 SETTINGS_ENCRYPT_KEY，兼容旧数据用的 NEXTAUTH_SECRET）：
 * 1. SETTINGS_ENCRYPT_KEY（推荐生产单独配置）
 * 2. NEXTAUTH_SECRET
 * 3. 仅开发：硬编码弱密钥 + 警告
 */
function resolveEncryptSecrets(): string[] {
  const dedicated = (process.env.SETTINGS_ENCRYPT_KEY || '').trim();
  const nextAuth = (process.env.NEXTAUTH_SECRET || '').trim();
  const secrets: string[] = [];
  if (dedicated) secrets.push(dedicated);
  if (nextAuth && nextAuth !== dedicated) secrets.push(nextAuth);
  return secrets;
}

function primaryEncryptSecret(): string {
  const secrets = resolveEncryptSecrets();
  if (secrets.length > 0) return secrets[0]!;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '生产环境必须配置 SETTINGS_ENCRYPT_KEY 或 NEXTAUTH_SECRET，禁止使用弱加密密钥'
    );
  }

  if (!warnedDevFallback) {
    warnedDevFallback = true;
    console.warn(
      '[settings] 警告：未配置 SETTINGS_ENCRYPT_KEY / NEXTAUTH_SECRET，使用开发弱密钥。生产部署前务必配置。'
    );
  }
  return DEV_FALLBACK_SECRET;
}

/** 生产启动检查：缺少加密密钥则拒绝启动 */
export function assertSettingsEncryptConfigured(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const secrets = resolveEncryptSecrets();
  if (secrets.length === 0) {
    throw new Error(
      '生产环境缺少 SETTINGS_ENCRYPT_KEY 或 NEXTAUTH_SECRET：拒绝启动以避免弱密钥加密配置'
    );
  }
}

function deriveKey(secret = primaryEncryptSecret()): Buffer {
  return hashSecret(secret);
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

  // 兼容：优先 SETTINGS_ENCRYPT_KEY，失败再试 NEXTAUTH_SECRET / 开发弱密钥
  const candidates = resolveEncryptSecrets();
  if (candidates.length === 0 && process.env.NODE_ENV !== 'production') {
    candidates.push(DEV_FALLBACK_SECRET);
  }
  if (candidates.length === 0) {
    candidates.push(primaryEncryptSecret());
  }

  let lastErr: unknown;
  for (const secret of candidates) {
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        deriveKey(secret),
        Buffer.from(ivB64, 'base64')
      );
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(dataB64, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('解密配置密钥失败');
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
  const [
    dbId,
    dbKey,
    dbBucket,
    dbRegion,
    dbCdn,
    dbThumb,
    dbWmEnabled,
    dbWmText,
    dbStyleThumb,
    dbStyleFull,
  ] = await Promise.all([
    getSettingRaw('cos.secretId'),
    getSettingRaw('cos.secretKey'),
    getSettingRaw('cos.bucket'),
    getSettingRaw('cos.region'),
    getSettingRaw('cos.cdnDomain'),
    getSettingRaw('cos.thumbWidth'),
    getSettingRaw('cos.watermarkEnabled'),
    getSettingRaw('cos.watermarkText'),
    getSettingRaw('cos.imageStyleThumb'),
    getSettingRaw('cos.imageStyleFull'),
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

  let watermarkEnabled = false;
  if (dbWmEnabled !== null) {
    fromDb++;
    watermarkEnabled = dbWmEnabled === '1' || dbWmEnabled === 'true';
  } else {
    watermarkEnabled =
      process.env.COS_WATERMARK_ENABLED === '1' ||
      process.env.COS_WATERMARK_ENABLED === 'true';
  }

  let watermarkText = '陈庆.我爱你';
  if (dbWmText !== null) {
    fromDb++;
    watermarkText = dbWmText.trim() || '陈庆.我爱你';
  } else if (process.env.COS_WATERMARK_TEXT?.trim()) {
    watermarkText = process.env.COS_WATERMARK_TEXT.trim();
  }

  let imageStyleThumb = '';
  if (dbStyleThumb !== null) {
    fromDb++;
    imageStyleThumb = dbStyleThumb.trim();
  } else if (process.env.COS_IMAGE_STYLE_THUMB?.trim()) {
    imageStyleThumb = process.env.COS_IMAGE_STYLE_THUMB.trim();
  }

  let imageStyleFull = '';
  if (dbStyleFull !== null) {
    fromDb++;
    imageStyleFull = dbStyleFull.trim();
  } else if (process.env.COS_IMAGE_STYLE_FULL?.trim()) {
    imageStyleFull = process.env.COS_IMAGE_STYLE_FULL.trim();
  }

  const source: CosRuntimeConfig['source'] =
    fromDb === 0 ? 'env' : fromDb >= 4 ? 'database' : 'mixed';

  return {
    secretId,
    secretKey,
    bucket,
    region,
    cdnDomain,
    thumbWidth,
    watermarkEnabled,
    watermarkText,
    imageStyleThumb,
    imageStyleFull,
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
    watermarkEnabled: c.watermarkEnabled,
    watermarkText: c.watermarkText,
    imageStyleThumb: c.imageStyleThumb,
    imageStyleFull: c.imageStyleFull,
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
  watermarkEnabled?: boolean;
  watermarkText?: string;
  imageStyleThumb?: string;
  imageStyleFull?: string;
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
  if (input.watermarkEnabled !== undefined) {
    await upsert('cos.watermarkEnabled', input.watermarkEnabled ? '1' : '0', false);
  }
  if (input.watermarkText !== undefined) {
    const t = input.watermarkText.trim().slice(0, 40);
    await upsert('cos.watermarkText', t || '陈庆.我爱你', false);
  }
  if (input.imageStyleThumb !== undefined) {
    await upsert(
      'cos.imageStyleThumb',
      input.imageStyleThumb.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64),
      false
    );
  }
  if (input.imageStyleFull !== undefined) {
    await upsert(
      'cos.imageStyleFull',
      input.imageStyleFull.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64),
      false
    );
  }
}

export { COS_KEYS, maskSecret };
