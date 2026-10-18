/**
 * 阿里云 OSS 扩展位（未实现）。
 * 选择 provider=oss 时会抛出明确错误，便于后续接入 ali-oss / 官方 SDK。
 */

import type { StorageCapabilities, StorageProvider } from '@/lib/storage/types';

const CAPABILITIES: StorageCapabilities = {
  imageProcess: true,
  watermark: true,
  imageStyle: false,
  sts: true,
  multipart: true,
  videoSnapshot: false,
};

export class OssStorageProvider implements StorageProvider {
  readonly id = 'oss' as const;
  readonly capabilities = CAPABILITIES;

  private notImplemented(): never {
    throw new Error(
      '阿里云 OSS Provider 尚未实现。请在设置中选择「腾讯云 COS」或「S3 兼容」，或等待后续版本。'
    );
  }

  getUploadUrl() {
    return this.notImplemented();
  }

  getSignedUrl() {
    return this.notImplemented();
  }

  deleteObject() {
    return this.notImplemented();
  }

  headObjectSize() {
    return this.notImplemented();
  }
}
