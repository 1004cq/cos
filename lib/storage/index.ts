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
  getS3Config,
  getS3ConfigPublic,
  getStorageConfigPublic,
  getStorageProviderId,
  saveStorageConfig,
  saveStorageProviderId,
  parseProviderId,
} from '@/lib/storage/config';

export { SIGN_CONCURRENCY };

let cached: { id: StorageProviderId; provider: StorageProvider } | null = null;

/** 测试或切换厂商后清缓存 */
export function resetStorageProviderCache() {
  cached = null;
}

bindStorageCacheReset(resetStorageProviderCache);

export async function getStorageProvider(): Promise<StorageProvider> {
  const id = await getStorageProviderId();
  if (cached && cached.id === id) return cached.provider;

  let provider: StorageProvider;
  if (id === 's3') {
    const cfg = await getS3Config();
    provider = new S3StorageProvider(cfg);
  } else if (id === 'oss') {
    provider = new OssStorageProvider();
  } else {
    provider = new CosStorageProvider();
  }

  cached = { id, provider };
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

/** 图库/分享：是否应用 COS 万象能力 */
export async function getImageProcessOptions(): Promise<{
  provider: StorageProviderId;
  watermarkEnabled: boolean;
  watermarkText: string;
  imageStyleThumb: string;
  imageStyleFull: string;
  thumbWidth: number;
  canProcess: boolean;
}> {
  const provider = await getStorageProvider();
  const canProcess = provider.capabilities.imageProcess;
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
    };
  }
  return {
    provider: provider.id,
    watermarkEnabled: false,
    watermarkText: '',
    imageStyleThumb: '',
    imageStyleFull: '',
    thumbWidth: 480,
    canProcess,
  };
}
