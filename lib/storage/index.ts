/**
 * 存储层入口：按配置返回 Provider，并导出业务常用便捷方法。
 */

import { generateKey as cosGenerateKey, SIGN_CONCURRENCY } from '@/lib/cos';
import { CosStorageProvider } from '@/lib/storage/cos-provider';
import { OssStorageProvider } from '@/lib/storage/oss-provider';
import { S3StorageProvider } from '@/lib/storage/s3-provider';
import {
  bindStorageCacheReset,
  getCosConfig,
  getOssConfig,
  getS3Config,
  getStorageProviderId,
} from '@/lib/storage/config';
import type {
  MultipartPart,
  SignOptions,
  StorageProvider,
  StorageProviderId,
} from '@/lib/storage/types';

export type {
  MultipartPart,
  SignOptions,
  StorageCapabilities,
  StorageProvider,
  StorageProviderId,
} from '@/lib/storage/types';

export {
  getCosConfig,
  getCosConfigPublic,
  getOssConfig,
  getOssConfigPublic,
  getS3Config,
  getS3ConfigPublic,
  getStorageConfigPublic,
  getStorageProviderId,
  saveStorageConfig,
  saveStorageProviderId,
  parseProviderId,
} from '@/lib/storage/config';

export { SIGN_CONCURRENCY };

let cached: {
  fingerprint: string;
  id: StorageProviderId;
  provider: StorageProvider;
} | null = null;

/** 配置指纹：厂商或凭证变更后必须重建 Provider（含 S3Client / OSS Client） */
async function getProviderFingerprint(id: StorageProviderId): Promise<string> {
  if (id === 's3') {
    const c = await getS3Config();
    return [
      's3',
      c.accessKeyId,
      `${c.secretAccessKey.length}:${c.secretAccessKey.slice(0, 4)}:${c.secretAccessKey.slice(-4)}`,
      c.bucket,
      c.region,
      c.endpoint,
      c.forcePathStyle ? '1' : '0',
      c.cdnDomain,
      c.publicBaseUrl,
    ].join('|');
  }
  if (id === 'oss') {
    const c = await getOssConfig();
    return [
      'oss',
      c.accessKeyId,
      `${c.accessKeySecret.length}:${c.accessKeySecret.slice(0, 4)}:${c.accessKeySecret.slice(-4)}`,
      c.bucket,
      c.region,
      c.endpoint,
      c.cname ? '1' : '0',
      c.cdnDomain,
      c.publicBaseUrl,
      String(c.thumbWidth),
      c.watermarkEnabled ? '1' : '0',
      c.watermarkText,
    ].join('|');
  }
  const c = await getCosConfig();
  return [
    'cos',
    c.secretId,
    `${c.secretKey.length}:${c.secretKey.slice(0, 4)}:${c.secretKey.slice(-4)}`,
    c.bucket,
    c.region,
    c.cdnDomain,
    String(c.thumbWidth),
    c.watermarkEnabled ? '1' : '0',
    c.watermarkText,
    c.imageStyleThumb,
    c.imageStyleFull,
  ].join('|');
}

function disposeProvider(provider: StorageProvider | null | undefined) {
  if (!provider) return;
  try {
    provider.dispose?.();
  } catch {
    /* ignore */
  }
}

/** 测试或切换厂商 / 改凭证后清缓存，使配置立即生效 */
export function resetStorageProviderCache() {
  disposeProvider(cached?.provider);
  cached = null;
}

bindStorageCacheReset(resetStorageProviderCache);

export async function getStorageProvider(): Promise<StorageProvider> {
  const id = await getStorageProviderId();
  const fingerprint = await getProviderFingerprint(id);
  if (cached && cached.fingerprint === fingerprint) return cached.provider;

  disposeProvider(cached?.provider);

  let provider: StorageProvider;
  if (id === 's3') {
    const cfg = await getS3Config();
    provider = new S3StorageProvider(cfg);
  } else if (id === 'oss') {
    const cfg = await getOssConfig();
    provider = new OssStorageProvider(cfg);
  } else {
    provider = new CosStorageProvider();
  }

  cached = { fingerprint, id, provider };
  return provider;
}

/** 对象键生成规则与 COS 时代一致：media/YYYY/MM/DD/... */
export function generateKey(filename: string): string {
  return cosGenerateKey(filename);
}

export async function getUploadPresignedUrl(
  key: string,
  contentType: string,
  expires = 300
) {
  const p = await getStorageProvider();
  return p.getUploadUrl(key, contentType, expires);
}

export async function getSignedUrl(
  key: string,
  expiresOrOpts?: number | SignOptions,
  legacyOpts?: SignOptions
) {
  const p = await getStorageProvider();
  // 兼容旧签名：getSignedUrl(key, expires, options)
  if (typeof expiresOrOpts === 'number') {
    return p.getSignedUrl(key, { ...(legacyOpts || {}), expires: expiresOrOpts });
  }
  return p.getSignedUrl(key, expiresOrOpts);
}

export async function deleteObject(key: string) {
  const p = await getStorageProvider();
  return p.deleteObject(key);
}

export async function headObjectSize(key: string) {
  const p = await getStorageProvider();
  return p.headObjectSize(key);
}

export async function putObjectBuffer(key: string, body: Buffer, contentType: string) {
  const p = await getStorageProvider();
  if (!p.putObjectBuffer) {
    throw new Error(`当前存储（${p.id}）不支持服务端直写对象`);
  }
  return p.putObjectBuffer(key, body, contentType);
}

export async function getObjectBytes(key: string, headers?: { Range?: string }) {
  const p = await getStorageProvider();
  if (!p.getObjectBytes) {
    throw new Error(`当前存储（${p.id}）不支持读取对象字节`);
  }
  return p.getObjectBytes(key, headers);
}

export async function initMultipartUpload(key: string, contentType: string) {
  const p = await getStorageProvider();
  if (!p.initMultipartUpload) {
    throw new Error(`当前存储（${p.id}）不支持分片上传`);
  }
  return p.initMultipartUpload(key, contentType);
}

export async function getMultipartPartPresignedUrl(
  key: string,
  uploadId: string,
  partNumber: number,
  expires = 600
) {
  const p = await getStorageProvider();
  if (!p.getPartUploadUrl) {
    throw new Error(`当前存储（${p.id}）不支持分片预签名`);
  }
  return p.getPartUploadUrl(key, uploadId, partNumber, expires);
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: MultipartPart[] | { PartNumber: number; ETag: string }[]
) {
  const p = await getStorageProvider();
  if (!p.completeMultipartUpload) {
    throw new Error(`当前存储（${p.id}）不支持完成分片`);
  }
  const normalized: MultipartPart[] = parts.map((part) => {
    if ('partNumber' in part) return part;
    return { partNumber: part.PartNumber, etag: part.ETag };
  });
  return p.completeMultipartUpload(key, uploadId, normalized);
}

export async function abortMultipartUpload(key: string, uploadId: string) {
  const p = await getStorageProvider();
  if (!p.abortMultipartUpload) return;
  return p.abortMultipartUpload(key, uploadId);
}

/** 图库/分享：是否应用服务端图片处理（COS 万象 / OSS 图片处理） */
export async function getImageProcessOptions(): Promise<{
  provider: StorageProviderId;
  watermarkEnabled: boolean;
  watermarkText: string;
  imageStyleThumb: string;
  imageStyleFull: string;
  thumbWidth: number;
  /** 当前厂商是否支持服务端缩略/样式/水印（等同 capabilities.imageProcess） */
  canProcess: boolean;
  imageProcess: boolean;
}> {
  const provider = await getStorageProvider();
  const imageProcess = Boolean(provider.capabilities.imageProcess);
  if (provider.id === 'cos') {
    const cfg = await getCosConfig();
    return {
      provider: 'cos',
      watermarkEnabled: cfg.watermarkEnabled,
      watermarkText: cfg.watermarkText,
      imageStyleThumb: cfg.imageStyleThumb,
      imageStyleFull: cfg.imageStyleFull,
      thumbWidth: cfg.thumbWidth,
      canProcess: true,
      imageProcess: true,
    };
  }
  if (provider.id === 'oss') {
    const cfg = await getOssConfig();
    return {
      provider: 'oss',
      watermarkEnabled: cfg.watermarkEnabled,
      watermarkText: cfg.watermarkText,
      imageStyleThumb: '',
      imageStyleFull: '',
      thumbWidth: cfg.thumbWidth,
      canProcess: true,
      imageProcess: true,
    };
  }
  return {
    provider: provider.id,
    watermarkEnabled: false,
    watermarkText: '',
    imageStyleThumb: '',
    imageStyleFull: '',
    thumbWidth: 480,
    canProcess: imageProcess,
    imageProcess,
  };
}
