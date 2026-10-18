/**
 * 腾讯云 COS Provider：委托现有 lib/cos.ts / cos-multipart（若存在），
 * 保证预签名、数据万象、水印、STS、HEAD 等行为与改造前一致。
 */

import {
  deleteObject as cosDeleteObject,
  getObjectBytes as cosGetObjectBytes,
  getSignedUrl as cosGetSignedUrl,
  getUploadPresignedUrl,
  headObjectSize as cosHeadObjectSize,
  putObjectBuffer as cosPutObjectBuffer,
  SIGN_CONCURRENCY,
} from '@/lib/cos';
import type {
  MultipartPart,
  SignOptions,
  StorageCapabilities,
  StorageProvider,
} from '@/lib/storage/types';

const CAPABILITIES: StorageCapabilities = {
  imageProcess: true,
  watermark: true,
  imageStyle: true,
  sts: true,
  multipart: true,
  videoSnapshot: true,
};

async function loadMultipart() {
  try {
    return await import('@/lib/cos-multipart');
  } catch {
    return null;
  }
}

export class CosStorageProvider implements StorageProvider {
  readonly id = 'cos' as const;
  readonly capabilities = CAPABILITIES;

  async getUploadUrl(key: string, contentType: string, expires = 300) {
    const { url, viaSts } = await getUploadPresignedUrl(key, contentType, expires);
    return { url, viaSts };
  }

  async getSignedUrl(key: string, options?: SignOptions) {
    const expires = options?.expires ?? 1800;
    return cosGetSignedUrl(key, expires, {
      thumb: options?.thumb,
      thumbWidth: options?.thumbWidth,
      watermark: options?.watermark,
      watermarkText: options?.watermarkText,
      style: options?.style,
      snapshot: options?.snapshot,
      snapshotTime: options?.snapshotTime,
    });
  }

  deleteObject(key: string) {
    return cosDeleteObject(key);
  }

  headObjectSize(key: string) {
    return cosHeadObjectSize(key);
  }

  putObjectBuffer(key: string, body: Buffer, contentType: string) {
    return cosPutObjectBuffer(key, body, contentType);
  }

  getObjectBytes(key: string, headers?: { Range?: string }) {
    return cosGetObjectBytes(key, headers);
  }

  async initMultipartUpload(key: string, contentType: string) {
    const mp = await loadMultipart();
    if (!mp?.initMultipartUpload) {
      throw new Error('当前构建未包含 COS 分片上传模块');
    }
    return mp.initMultipartUpload(key, contentType);
  }

  async getPartUploadUrl(
    key: string,
    uploadId: string,
    partNumber: number,
    expires = 600
  ) {
    const mp = await loadMultipart();
    if (!mp?.getMultipartPartPresignedUrl) {
      throw new Error('当前构建未包含 COS 分片上传模块');
    }
    return mp.getMultipartPartPresignedUrl(key, uploadId, partNumber, expires);
  }

  async completeMultipartUpload(key: string, uploadId: string, parts: MultipartPart[]) {
    const mp = await loadMultipart();
    if (!mp?.completeMultipartUpload) {
      throw new Error('当前构建未包含 COS 分片上传模块');
    }
    await mp.completeMultipartUpload(
      key,
      uploadId,
      parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag }))
    );
  }

  async abortMultipartUpload(key: string, uploadId: string) {
    const mp = await loadMultipart();
    if (!mp?.abortMultipartUpload) return;
    await mp.abortMultipartUpload(key, uploadId);
  }
}

export { SIGN_CONCURRENCY };
