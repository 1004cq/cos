/**
 * S3 兼容 Provider（AWS S3 / Cloudflare R2 / MinIO 等）。
 * 无数据万象：thumb/style/watermark/snapshot 由调用方降级（posterKey / 占位），不在此签「缩略原图」。
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

/** 将 AWS / S3 兼容错误转为可读中文 */
export function formatS3Error(err: unknown): string {
  if (!err) return '未知错误';

  const e = err as {
    name?: string;
    Code?: string;
    code?: string;
    message?: string;
    $metadata?: { httpStatusCode?: number };
    cause?: { code?: string; message?: string };
  };

  const code = e.name || e.Code || e.code || e.cause?.code || '';
  const status = e.$metadata?.httpStatusCode;
  const raw = e.message || e.cause?.message || String(err);
  const lower = `${code} ${raw} ${status ?? ''}`.toLowerCase();

  if (
    lower.includes('invalidaccesskeyid') ||
    lower.includes('invalidsecurity') ||
    lower.includes('unrecognizedclientexception')
  ) {
    return 'Access Key 无效：请核对 Access Key ID 是否正确';
  }
  if (
    lower.includes('signaturedoesnotmatch') ||
    lower.includes('invalidsignature') ||
    lower.includes('authorizationheadermalformed')
  ) {
    return '签名校验失败：请核对 Secret Access Key，以及 Endpoint / Region 是否与桶匹配';
  }
  if (lower.includes('accessdenied') || status === 403) {
    return '权限不足：请确认密钥对该 Bucket 有 s3:ListBucket / s3:GetObject / s3:PutObject 等权限';
  }
  if (lower.includes('nosuchbucket') || lower.includes('permanentredirect')) {
    return 'Bucket 不存在或 Region/Endpoint 不匹配：请核对桶名与 Endpoint';
  }
  if (
    lower.includes('enotfound') ||
    lower.includes('econnrefused') ||
    lower.includes('enetunreach') ||
    lower.includes('getaddrinfo') ||
    lower.includes('timeout') ||
    lower.includes('timed out')
  ) {
    return '无法连接 Endpoint：请检查网络、Endpoint URL，以及是否需开启 Path-Style（MinIO）';
  }
  if (lower.includes('credentials') && lower.includes('not')) {
    return 'S3 凭证未配置完整：请填写 Access Key、Secret 与 Bucket';
  }

  const safe = raw.replace(/(AKIA|ASIA)[A-Z0-9]+/gi, 'AKIA****').slice(0, 280);
  return code ? `${code}: ${safe}` : safe;
}

export class S3StorageProvider implements StorageProvider {
  readonly id = 's3' as const;
  readonly capabilities = CAPABILITIES;

  private _client: S3Client | null = null;

  constructor(private readonly cfg: S3RuntimeConfig) {}

  /** 实例内复用 S3Client，避免每次签名新建连接 */
  private client(): S3Client {
    if (!this._client) {
      this._client = createClient(this.cfg);
    }
    return this._client;
  }

  dispose() {
    if (this._client) {
      try {
        this._client.destroy();
      } catch {
        /* ignore */
      }
      this._client = null;
    }
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
    // S3 无数据万象：忽略 thumb / watermark / style / snapshot，仅签原对象
    // 列表缩略应由调用方用 posterKey 或返回 null，勿把本 URL 当网格封面
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
    if (!this.cfg.accessKeyId || !this.cfg.secretAccessKey || !this.cfg.bucket) {
      return {
        ok: false,
        error: '配置不完整：需要 Access Key / Secret / Bucket',
        detail: this.cfg.bucket || undefined,
      };
    }

    const detail = `${this.cfg.bucket}${
      this.cfg.endpoint ? ` @ ${this.cfg.endpoint}` : this.cfg.region ? ` @ ${this.cfg.region}` : ''
    }`;

    try {
      const client = this.client();
      // 探针键不存在时 404 = 凭证与桶可达
      await client.send(
        new HeadObjectCommand({
          Bucket: this.cfg.bucket,
          Key: '__cos_storage_probe_nonexistent__',
        })
      );
      return { ok: true, detail };
    } catch (err: unknown) {
      const e = err as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
        message?: string;
      };
      if (
        e.name === 'NotFound' ||
        e.name === 'NoSuchKey' ||
        e.$metadata?.httpStatusCode === 404
      ) {
        return { ok: true, detail };
      }
      return {
        ok: false,
        error: formatS3Error(err),
        detail,
      };
    }
  }
}
