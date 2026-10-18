/**
 * 统一对象存储抽象。
 * 业务侧只依赖本接口；腾讯云 / S3 兼容 /（预留）阿里云 OSS 各自实现。
 */

export type StorageProviderId = 'cos' | 's3' | 'oss';

export type SignOptions = {
  /** 有效期秒数；未传时由实现默认（通常 1800） */
  expires?: number;
  thumb?: boolean;
  thumbWidth?: number;
  watermark?: boolean;
  watermarkText?: string;
  /** 腾讯云数据万象样式名；非 COS 忽略 */
  style?: string;
  /** 腾讯云 CI 视频截帧；非 COS 忽略 */
  snapshot?: boolean;
  snapshotTime?: number;
};

export type StorageCapabilities = {
  /** 数据万象 / 服务端缩略 */
  imageProcess: boolean;
  /** 展示水印 */
  watermark: boolean;
  /** 图片样式（原图保护） */
  imageStyle: boolean;
  /** STS 临时密钥上传 */
  sts: boolean;
  /** 分片上传 */
  multipart: boolean;
  /** 视频 CI 截帧 */
  videoSnapshot: boolean;
};

export type MultipartPart = {
  partNumber: number;
  etag: string;
};

export interface StorageProvider {
  readonly id: StorageProviderId;
  readonly capabilities: StorageCapabilities;

  getUploadUrl(
    key: string,
    contentType: string,
    expires?: number
  ): Promise<{ url: string; viaSts?: boolean }>;

  getSignedUrl(key: string, options?: SignOptions): Promise<string>;

  deleteObject(key: string): Promise<void>;

  headObjectSize(key: string): Promise<number | null>;

  /** 服务端直写（海报等）；可选 */
  putObjectBuffer?(key: string, body: Buffer, contentType: string): Promise<void>;

  /** 读取对象字节（元数据 / 同源代理）；可选 */
  getObjectBytes?(
    key: string,
    headers?: { Range?: string }
  ): Promise<{
    body: Buffer;
    statusCode: number;
    contentType?: string;
    contentLength?: string;
    contentRange?: string;
    acceptRanges?: string;
  }>;

  initMultipartUpload?(
    key: string,
    contentType: string
  ): Promise<{ uploadId: string; viaSts?: boolean }>;

  getPartUploadUrl?(
    key: string,
    uploadId: string,
    partNumber: number,
    expires?: number
  ): Promise<{ url: string; viaSts?: boolean }>;

  completeMultipartUpload?(
    key: string,
    uploadId: string,
    parts: MultipartPart[]
  ): Promise<void>;

  abortMultipartUpload?(key: string, uploadId: string): Promise<void>;

  /** 连通性测试（head bucket / 探针对象） */
  testConnection?(): Promise<{ ok: boolean; error?: string; detail?: string }>;

  /** 释放底层客户端（如 S3Client）；缓存切换时调用 */
  dispose?(): void;
}

export type StorageRuntimeConfig = {
  provider: StorageProviderId;
  /** COS 专用字段见 getCosConfig；S3 见 getS3Config */
};
