/**
 * S3 兼容 Provider（AWS S3 / Cloudflare R2 / MinIO 等）。
 * 缩略图、水印、样式、视频截帧：不支持则降级为原图签名。
 */

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl as awsGetSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { S3RuntimeConfig } from '@/lib/storage/config';
import type {
  MultipartPart,
  SignOptions,
  StorageCapabilities,
  StorageProvider,
} from '@/lib/storage/types';

const CAPABILITIES: StorageCapabilities = {
  imageProcess: false,
  watermark: false,
  imageStyle: false,
  sts: false,
  multipart: true,
  videoSnapshot: false,
};

function assertMediaKey(key: string) {
  if (!key.startsWith('media/')) {
    throw new Error('非法的对象键');
  }
}

function createClient(cfg: S3RuntimeConfig): S3Client {
  if (!cfg.accessKeyId || !cfg.secretAccessKey || !cfg.bucket) {
    throw new Error('S3 未配置完整（Access Key / Secret / Bucket）');
  }
  return new S3Client({
    region: cfg.region || 'auto',
    endpoint: cfg.endpoint || undefined,
    forcePathStyle: cfg.forcePathStyle,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

/** GET 可读时换 CDN / 公共域名（不对 PUT 套） */
function applyPublicHost(url: string, publicBase: string): string {
  if (!publicBase) return url;
  try {
    const base = publicBase.replace(/\/$/, '');
    const u = new URL(url);
    const b = new URL(/^https?:\/\//i.test(base) ? base : `https://${base}`);
    u.protocol = b.protocol;
    u.host = b.host;
    return u.toString();
  } catch {
    return url;
  }
}

export class S3StorageProvider implements StorageProvider {
  readonly id = 's3' as const;
  readonly capabilities = CAPABILITIES;

  constructor(private readonly cfg: S3RuntimeConfig) {}

  private client() {
    return createClient(this.cfg);
  }

  async getUploadUrl(key: string, contentType: string, expires = 300) {
    assertMediaKey(key);
    const client = this.client();
    const safeExpires = Math.min(Math.max(expires, 60), 600);
    const cmd = new PutObjectCommand({
      Bucket: this.cfg.bucket,
      Key: key,
      ContentType: contentType,
    });
    const url = await awsGetSignedUrl(client, cmd, { expiresIn: safeExpires });
    return { url, viaSts: false };
  }

  async getSignedUrl(key: string, options?: SignOptions) {
    assertMediaKey(key);
    // S3 无数据万象：忽略 thumb / watermark / style / snapshot，签原对象
    if (
      options?.thumb ||
      options?.watermark ||
      options?.style ||
      options?.snapshot
    ) {
      // 降级：仍返回可读原图签名，由调用方用原图或已存 poster
    }
    const client = this.client();
    const expires = Math.min(Math.max(options?.expires ?? 1800, 60), 3600);
    const cmd = new GetObjectCommand({
      Bucket: this.cfg.bucket,
      Key: key,
    });
    let url = await awsGetSignedUrl(client, cmd, { expiresIn: expires });
    const publicBase = this.cfg.cdnDomain || this.cfg.publicBaseUrl;
    if (publicBase) {
      url = applyPublicHost(url, publicBase);
    }
    return url;
  }

  async deleteObject(key: string) {
    assertMediaKey(key);
    const client = this.client();
    await client.send(
      new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key })
    );
  }

  async headObjectSize(key: string): Promise<number | null> {
    assertMediaKey(key);
    const client = this.client();
    try {
      const out = await client.send(
        new HeadObjectCommand({ Bucket: this.cfg.bucket, Key: key })
      );
      const n = out.ContentLength;
      return typeof n === 'number' && Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }

  async putObjectBuffer(key: string, body: Buffer, contentType: string) {
    assertMediaKey(key);
    const client = this.client();
    await client.send(
      new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
  }

  async getObjectBytes(key: string, headers?: { Range?: string }) {
    assertMediaKey(key);
    const client = this.client();
    const out = await client.send(
      new GetObjectCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        Range: headers?.Range,
      })
    );
    const bytes = out.Body
      ? Buffer.from(await out.Body.transformToByteArray())
      : Buffer.alloc(0);
    return {
      body: bytes,
      statusCode: headers?.Range ? 206 : 200,
      contentType: out.ContentType,
      contentLength: String(out.ContentLength ?? bytes.length),
      contentRange: out.ContentRange,
      acceptRanges: out.AcceptRanges || 'bytes',
    };
  }

  async initMultipartUpload(key: string, contentType: string) {
    assertMediaKey(key);
    const client = this.client();
    const out = await client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        ContentType: contentType,
      })
    );
    if (!out.UploadId) throw new Error('S3 初始化分片失败：无 UploadId');
    return { uploadId: out.UploadId, viaSts: false };
  }

  async getPartUploadUrl(
    key: string,
    uploadId: string,
    partNumber: number,
    expires = 600
  ) {
    assertMediaKey(key);
    const client = this.client();
    const safeExpires = Math.min(Math.max(expires, 60), 600);
    const cmd = new UploadPartCommand({
      Bucket: this.cfg.bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });
    const url = await awsGetSignedUrl(client, cmd, { expiresIn: safeExpires });
    return { url, viaSts: false };
  }

  async completeMultipartUpload(key: string, uploadId: string, parts: MultipartPart[]) {
    assertMediaKey(key);
    const client = this.client();
    const normalized = parts
      .map((p) => ({
        PartNumber: Number(p.partNumber),
        ETag: String(p.etag || '').replace(/^"|"$/g, ''),
      }))
      .filter((p) => p.PartNumber >= 1 && p.ETag)
      .sort((a, b) => a.PartNumber - b.PartNumber);

    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: normalized },
      })
    );
  }

  async abortMultipartUpload(key: string, uploadId: string) {
    assertMediaKey(key);
    const client = this.client();
    await client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        UploadId: uploadId,
      })
    );
  }

  async testConnection() {
    try {
      const client = this.client();
      // 用 HeadObject 不存在的探针键，或 List 代价高；改用 HeadBucket 不可用时对 bucket 发空 key Head
      await client.send(
        new HeadObjectCommand({
          Bucket: this.cfg.bucket,
          Key: '__cos_storage_probe_nonexistent__',
        })
      );
      return { ok: true, detail: `${this.cfg.bucket}` };
    } catch (err: unknown) {
      const e = err as { name?: string; $metadata?: { httpStatusCode?: number }; message?: string };
      // 404/NotFound 说明凭证与桶可达
      if (
        e.name === 'NotFound' ||
        e.name === 'NoSuchKey' ||
        e.$metadata?.httpStatusCode === 404
      ) {
        return {
          ok: true,
          detail: `${this.cfg.bucket}${this.cfg.endpoint ? ` @ ${this.cfg.endpoint}` : ''}`,
        };
      }
      return {
        ok: false,
        error: e.message || String(err),
        detail: this.cfg.bucket,
      };
    }
  }
}
