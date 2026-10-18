/**
 * 存储厂商配置读写（SystemSetting + env 回退）。
 * COS 字段仍走 lib/settings.getCosConfig，保持兼容。
 */

import {
  decryptSecret,
  encryptSecret,
  getCosConfig,
  getCosConfigPublic,
  isUnsafeCdnHost,
  maskSecret,
  normalizeCdnHost,
  saveCosConfig,
  type CosConfigInput,
  type CosRuntimeConfig,
} from '@/lib/settings';
import { prisma } from '@/lib/prisma';
import type { StorageProviderId } from '@/lib/storage/types';

const PROVIDER_KEY = 'storage.provider';

const S3_KEYS = [
  's3.accessKeyId',
  's3.secretAccessKey',
  's3.bucket',
  's3.region',
  's3.endpoint',
  's3.forcePathStyle',
  's3.cdnDomain',
  's3.publicBaseUrl',
] as const;

const OSS_KEYS = [
  'oss.accessKeyId',
  'oss.accessKeySecret',
  'oss.bucket',
  'oss.region',
  'oss.endpoint',
  'oss.cname',
  'oss.cdnDomain',
  'oss.publicBaseUrl',
  'oss.thumbWidth',
  'oss.watermarkEnabled',
  'oss.watermarkText',
] as const;

export type S3RuntimeConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  /** 自定义 endpoint（R2 / MinIO）；AWS 可留空 */
  endpoint: string;
  forcePathStyle: boolean;
  cdnDomain: string;
  publicBaseUrl: string;
  source: 'database' | 'env' | 'mixed';
};

export type OssRuntimeConfig = {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  /** 如 oss-cn-hangzhou */
  region: string;
  /** 自定义 endpoint；可与 cname 配合 */
  endpoint: string;
  /** endpoint 为自定义/CDN 域名时为 true */
  cname: boolean;
  cdnDomain: string;
  publicBaseUrl: string;
  thumbWidth: number;
  watermarkEnabled: boolean;
  watermarkText: string;
  source: 'database' | 'env' | 'mixed';
};

async function getSettingRaw(key: string): Promise<string | null> {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key } });
    return row?.value ?? null;
  } catch {
    return null;
  }
}

async function upsertSetting(key: string, value: string, secret = false) {
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value, secret },
    update: { value, secret },
  });
}

export function parseProviderId(raw: string | null | undefined): StorageProviderId {
  const v = (raw || '').trim().toLowerCase();
  if (v === 's3' || v === 'r2' || v === 'minio') return 's3';
  if (v === 'oss' || v === 'aliyun') return 'oss';
  return 'cos';
}

export async function getStorageProviderId(): Promise<StorageProviderId> {
  const db = await getSettingRaw(PROVIDER_KEY);
  if (db !== null) return parseProviderId(db);
  return parseProviderId(process.env.STORAGE_PROVIDER || process.env.COS_PROVIDER || 'cos');
}

export async function saveStorageProviderId(id: StorageProviderId): Promise<void> {
  await upsertSetting(PROVIDER_KEY, id, false);
}

export async function getS3Config(): Promise<S3RuntimeConfig> {
  const [
    dbAk,
    dbSk,
    dbBucket,
    dbRegion,
    dbEndpoint,
    dbPathStyle,
    dbCdn,
    dbPublic,
  ] = await Promise.all(S3_KEYS.map((k) => getSettingRaw(k)));

  let fromDb = 0;
  const accessKeyId = dbAk
    ? (fromDb++, dbAk.includes(':') ? decryptSecret(dbAk) : dbAk)
    : process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '';
  const secretAccessKey = dbSk
    ? (fromDb++, decryptSecret(dbSk))
    : process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '';
  const bucket = dbBucket
    ? (fromDb++, dbBucket)
    : process.env.S3_BUCKET || process.env.AWS_S3_BUCKET || '';
  const region = dbRegion
    ? (fromDb++, dbRegion)
    : process.env.S3_REGION || process.env.AWS_REGION || 'auto';

  let endpoint = '';
  if (dbEndpoint !== null) {
    fromDb++;
    endpoint = dbEndpoint.trim();
  } else {
    endpoint = (process.env.S3_ENDPOINT || '').trim();
  }

  let forcePathStyle = false;
  if (dbPathStyle !== null) {
    fromDb++;
    forcePathStyle = dbPathStyle === '1' || dbPathStyle === 'true';
  } else {
    forcePathStyle =
      process.env.S3_FORCE_PATH_STYLE === '1' ||
      process.env.S3_FORCE_PATH_STYLE === 'true';
  }

  let cdnDomain = '';
  if (dbCdn !== null) {
    fromDb++;
    cdnDomain = normalizeCdnHost(dbCdn);
  } else {
    cdnDomain = normalizeCdnHost(process.env.S3_CDN_DOMAIN || '');
  }
  if (isUnsafeCdnHost(cdnDomain)) cdnDomain = '';

  let publicBaseUrl = '';
  if (dbPublic !== null) {
    fromDb++;
    publicBaseUrl = dbPublic.trim();
  } else {
    publicBaseUrl = (process.env.S3_PUBLIC_BASE_URL || '').trim();
  }

  const source: S3RuntimeConfig['source'] =
    fromDb === 0 ? 'env' : fromDb >= 3 ? 'database' : 'mixed';

  return {
    accessKeyId,
    secretAccessKey,
    bucket,
    region,
    endpoint,
    forcePathStyle,
    cdnDomain,
    publicBaseUrl,
    source,
  };
}

export type S3ConfigInput = {
  accessKeyId?: string;
  secretAccessKey?: string;
  bucket?: string;
  region?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  cdnDomain?: string;
  publicBaseUrl?: string;
};

export async function saveS3Config(input: S3ConfigInput): Promise<void> {
  if (input.accessKeyId !== undefined && input.accessKeyId.trim()) {
    if (!input.accessKeyId.includes('****')) {
      await upsertSetting('s3.accessKeyId', encryptSecret(input.accessKeyId.trim()), true);
    }
  }
  if (input.secretAccessKey !== undefined && input.secretAccessKey.trim()) {
    if (!input.secretAccessKey.includes('****')) {
      await upsertSetting(
        's3.secretAccessKey',
        encryptSecret(input.secretAccessKey.trim()),
        true
      );
    }
  }
  if (input.bucket !== undefined) {
    await upsertSetting('s3.bucket', input.bucket.trim(), false);
  }
  if (input.region !== undefined) {
    await upsertSetting('s3.region', input.region.trim() || 'auto', false);
  }
  if (input.endpoint !== undefined) {
    await upsertSetting('s3.endpoint', input.endpoint.trim(), false);
  }
  if (input.forcePathStyle !== undefined) {
    await upsertSetting('s3.forcePathStyle', input.forcePathStyle ? '1' : '0', false);
  }
  if (input.cdnDomain !== undefined) {
    let host = normalizeCdnHost(input.cdnDomain);
    if (isUnsafeCdnHost(host)) host = '';
    await upsertSetting('s3.cdnDomain', host, false);
  }
  if (input.publicBaseUrl !== undefined) {
    await upsertSetting('s3.publicBaseUrl', input.publicBaseUrl.trim(), false);
  }
}

export async function getS3ConfigPublic() {
  const c = await getS3Config();
  return {
    accessKeyId: c.accessKeyId ? maskSecret(c.accessKeyId) : '',
    accessKeyIdSet: Boolean(c.accessKeyId),
    secretAccessKeySet: Boolean(c.secretAccessKey),
    bucket: c.bucket,
    region: c.region,
    endpoint: c.endpoint,
    forcePathStyle: c.forcePathStyle,
    cdnDomain: c.cdnDomain,
    publicBaseUrl: c.publicBaseUrl,
    source: c.source,
    ready: Boolean(c.accessKeyId && c.secretAccessKey && c.bucket),
  };
}

export async function getOssConfig(): Promise<OssRuntimeConfig> {
  const [
    dbAk,
    dbSk,
    dbBucket,
    dbRegion,
    dbEndpoint,
    dbCname,
    dbCdn,
    dbPublic,
    dbThumb,
    dbWmEnabled,
    dbWmText,
  ] = await Promise.all(OSS_KEYS.map((k) => getSettingRaw(k)));

  let fromDb = 0;
  const accessKeyId = dbAk
    ? (fromDb++, dbAk.includes(':') ? decryptSecret(dbAk) : dbAk)
    : process.env.OSS_ACCESS_KEY_ID || process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || '';
  const accessKeySecret = dbSk
    ? (fromDb++, decryptSecret(dbSk))
    : process.env.OSS_ACCESS_KEY_SECRET ||
      process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET ||
      '';
  const bucket = dbBucket
    ? (fromDb++, dbBucket)
    : process.env.OSS_BUCKET || '';
  const region = dbRegion
    ? (fromDb++, dbRegion)
    : process.env.OSS_REGION || 'oss-cn-hangzhou';

  let endpoint = '';
  if (dbEndpoint !== null) {
    fromDb++;
    endpoint = dbEndpoint.trim();
  } else {
    endpoint = (process.env.OSS_ENDPOINT || '').trim();
  }

  let cname = false;
  if (dbCname !== null) {
    fromDb++;
    cname = dbCname === '1' || dbCname === 'true';
  } else {
    cname = process.env.OSS_CNAME === '1' || process.env.OSS_CNAME === 'true';
  }

  let cdnDomain = '';
  if (dbCdn !== null) {
    fromDb++;
    cdnDomain = normalizeCdnHost(dbCdn);
  } else {
    cdnDomain = normalizeCdnHost(process.env.OSS_CDN_DOMAIN || '');
  }
  if (isUnsafeCdnHost(cdnDomain)) cdnDomain = '';

  let publicBaseUrl = '';
  if (dbPublic !== null) {
    fromDb++;
    publicBaseUrl = dbPublic.trim();
  } else {
    publicBaseUrl = (process.env.OSS_PUBLIC_BASE_URL || '').trim();
  }

  let thumbWidth = 480;
  if (dbThumb !== null) {
    fromDb++;
    thumbWidth = Math.min(1200, Math.max(120, parseInt(dbThumb, 10) || 480));
  } else if (process.env.OSS_THUMB_WIDTH) {
    thumbWidth = Math.min(
      1200,
      Math.max(120, parseInt(process.env.OSS_THUMB_WIDTH, 10) || 480)
    );
  }

  let watermarkEnabled = false;
  if (dbWmEnabled !== null) {
    fromDb++;
    watermarkEnabled = dbWmEnabled === '1' || dbWmEnabled === 'true';
  } else {
    watermarkEnabled =
      process.env.OSS_WATERMARK_ENABLED === '1' ||
      process.env.OSS_WATERMARK_ENABLED === 'true';
  }

  let watermarkText = 'Gallery';
  if (dbWmText !== null) {
    fromDb++;
    watermarkText = dbWmText.trim().slice(0, 40) || watermarkText;
  } else if (process.env.OSS_WATERMARK_TEXT?.trim()) {
    watermarkText = process.env.OSS_WATERMARK_TEXT.trim().slice(0, 40);
  }

  const source: OssRuntimeConfig['source'] =
    fromDb === 0 ? 'env' : fromDb >= 3 ? 'database' : 'mixed';

  return {
    accessKeyId,
    accessKeySecret,
    bucket,
    region,
    endpoint,
    cname,
    cdnDomain,
    publicBaseUrl,
    thumbWidth,
    watermarkEnabled,
    watermarkText,
    source,
  };
}

export type OssConfigInput = {
  accessKeyId?: string;
  accessKeySecret?: string;
  bucket?: string;
  region?: string;
  endpoint?: string;
  cname?: boolean;
  cdnDomain?: string;
  publicBaseUrl?: string;
  thumbWidth?: number;
  watermarkEnabled?: boolean;
  watermarkText?: string;
};

export async function saveOssConfig(input: OssConfigInput): Promise<void> {
  if (input.accessKeyId !== undefined && input.accessKeyId.trim()) {
    if (!input.accessKeyId.includes('****')) {
      await upsertSetting('oss.accessKeyId', encryptSecret(input.accessKeyId.trim()), true);
    }
  }
  if (input.accessKeySecret !== undefined && input.accessKeySecret.trim()) {
    if (!input.accessKeySecret.includes('****')) {
      await upsertSetting(
        'oss.accessKeySecret',
        encryptSecret(input.accessKeySecret.trim()),
        true
      );
    }
  }
  if (input.bucket !== undefined) {
    await upsertSetting('oss.bucket', input.bucket.trim(), false);
  }
  if (input.region !== undefined) {
    await upsertSetting('oss.region', input.region.trim() || 'oss-cn-hangzhou', false);
  }
  if (input.endpoint !== undefined) {
    await upsertSetting('oss.endpoint', input.endpoint.trim(), false);
  }
  if (input.cname !== undefined) {
    await upsertSetting('oss.cname', input.cname ? '1' : '0', false);
  }
  if (input.cdnDomain !== undefined) {
    let host = normalizeCdnHost(input.cdnDomain);
    if (isUnsafeCdnHost(host)) host = '';
    await upsertSetting('oss.cdnDomain', host, false);
  }
  if (input.publicBaseUrl !== undefined) {
    await upsertSetting('oss.publicBaseUrl', input.publicBaseUrl.trim(), false);
  }
  if (input.thumbWidth !== undefined) {
    const w = Math.min(1200, Math.max(120, Number(input.thumbWidth) || 480));
    await upsertSetting('oss.thumbWidth', String(w), false);
  }
  if (input.watermarkEnabled !== undefined) {
    await upsertSetting('oss.watermarkEnabled', input.watermarkEnabled ? '1' : '0', false);
  }
  if (input.watermarkText !== undefined) {
    await upsertSetting(
      'oss.watermarkText',
      input.watermarkText.trim().slice(0, 40) || 'Gallery',
      false
    );
  }
}

export async function getOssConfigPublic() {
  const c = await getOssConfig();
  return {
    accessKeyId: c.accessKeyId ? maskSecret(c.accessKeyId) : '',
    accessKeyIdSet: Boolean(c.accessKeyId),
    accessKeySecretSet: Boolean(c.accessKeySecret),
    bucket: c.bucket,
    region: c.region,
    endpoint: c.endpoint,
    cname: c.cname,
    cdnDomain: c.cdnDomain,
    publicBaseUrl: c.publicBaseUrl,
    thumbWidth: c.thumbWidth,
    watermarkEnabled: c.watermarkEnabled,
    watermarkText: c.watermarkText,
    source: c.source,
    ready: Boolean(c.accessKeyId && c.accessKeySecret && c.bucket),
  };
}

/** 合并公开配置：含 provider + 当前厂商字段 + COS/S3/OSS 各自块 */
export async function getStorageConfigPublic() {
  const provider = await getStorageProviderId();
  const [cos, s3, oss] = await Promise.all([
    getCosConfigPublic(),
    getS3ConfigPublic(),
    getOssConfigPublic(),
  ]);
  const ready =
    provider === 'cos'
      ? cos.ready
      : provider === 's3'
        ? s3.ready
        : provider === 'oss'
          ? oss.ready
          : false;
  return {
    // 兼容旧前端：扁平展开 COS 字段
    ...cos,
    provider,
    ready,
    cos,
    s3,
    oss,
  };
}

export type StorageConfigSaveInput = {
  provider?: StorageProviderId;
  cos?: CosConfigInput;
  s3?: S3ConfigInput;
  oss?: OssConfigInput;
};

export async function saveStorageConfig(input: StorageConfigSaveInput): Promise<void> {
  if (input.provider) {
    await saveStorageProviderId(parseProviderId(input.provider));
  }

  if (input.cos) {
    await saveCosConfig(input.cos);
  }
  if (input.s3) {
    await saveS3Config(input.s3);
  }
  if (input.oss) {
    await saveOssConfig(input.oss);
  }

  // 任意配置写入后立即清 Provider 缓存（含仅改密钥 / 桶等）
  resetProviderHint();
}

/** 避免循环依赖：由 index 注入 */
let resetProviderHint: () => void = () => undefined;
export function bindStorageCacheReset(fn: () => void) {
  resetProviderHint = fn;
}

export { getCosConfig, getCosConfigPublic, saveCosConfig };
export type { CosRuntimeConfig, CosConfigInput };
