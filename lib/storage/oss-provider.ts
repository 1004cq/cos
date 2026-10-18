/**
 * 阿里云 OSS Provider（ali-oss）。
 * 缩略图：x-oss-process image/resize；可选文字水印。
 * 样式名 / 视频截帧：不支持则签原图。
 */

import OSS from 'ali-oss';
import type { OssRuntimeConfig } from '@/lib/storage/config';
import type {
  MultipartPart,
  SignOptions,
  StorageCapabilities,
  StorageProvider,
} from '@/lib/storage/types';

const CAPABILITIES: StorageCapabilities = {
  imageProcess: true,
  watermark: true,
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

/** 规范 region：cn-hangzhou → oss-cn-hangzhou */
export function normalizeOssRegion(region: string): string {
  const r = (region || '').trim();
  if (!r) return 'oss-cn-hangzhou';
  if (r.startsWith('oss-')) return r;
  return `oss-${r}`;
}

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

/** OSS 文字水印：URL-safe Base64（无填充） */
function encodeOssWatermarkText(text: string): string {
  return Buffer.from(text, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function buildImageProcess(options?: SignOptions): string | undefined {
  if (options?.snapshot) {
    // OSS 无等价 CI 截帧：调用方应降级
    return undefined;
  }
  // 样式名是 COS 概念，忽略
  const parts: string[] = [];
  if (options?.thumb) {
    const w = Math.min(1200, Math.max(64, options.thumbWidth ?? 480));
    parts.push(`image/resize,m_lfit,w_${w}`);
  }
  if (options?.watermark && options.watermarkText?.trim()) {
    const t = encodeOssWatermarkText(options.watermarkText.trim().slice(0, 40));
    if (parts.length === 0) parts.push('image');
    // 挂到已有 image 流水线：resize,.../watermark,...
    if (parts[0]?.startsWith('image/')) {
      parts[0] = `${parts[0]}/watermark,text_${t},size_20,g_se,t_40,color_FFFFFF`;
    } else {
      parts.push(`image/watermark,text_${t},size_20,g_se,t_40,color_FFFFFF`);
    }
  }
  return parts.length ? parts.join('/') : undefined;
}

export function formatOssError(err: unknown): string {
  if (!err) return '未知错误';
  const e = err as {
    code?: string;
    name?: string;
    message?: string;
    status?: number;
    requestId?: string;
  };
  const code = e.code || e.name || '';
  const status = e.status;
  const raw = e.message || String(err);
  const lower = `${code} ${raw} ${status ?? ''}`.toLowerCase();

  if (
    lower.includes('invalidaccesskeyid') ||
    lower.includes('invalidaccesskey') ||
    code === 'InvalidAccessKeyId'
  ) {
    return 'AccessKeyId 无效：请核对 AccessKey ID';
  }
  if (
    lower.includes('signaturedoesnotmatch') ||
    lower.includes('invalidsecuritytoken') ||
    code === 'SignatureDoesNotMatch'
  ) {
    return '签名校验失败：请核对 AccessKey Secret，以及 Region / Endpoint 是否与桶匹配';
  }
  if (lower.includes('accessdenied') || status === 403) {
    return '权限不足：请确认 RAM 用户对该 Bucket 有读写权限';
  }
  if (
    lower.includes('nosuchbucket') ||
    lower.includes('no such bucket') ||
    code === 'NoSuchBucket'
  ) {
    return 'Bucket 不存在或 Region 不正确：请核对桶名与 Region（如 oss-cn-hangzhou）';
  }
  if (
    lower.includes('enotfound') ||
    lower.includes('econnrefused') ||
    lower.includes('timeout') ||
    lower.includes('getaddrinfo')
  ) {
    return '无法连接 OSS Endpoint：请检查网络与 Region / 自定义 Endpoint';
  }
  if (lower.includes('securitytokenexpired')) {
    return '临时凭证已过期，请重新获取 STS Token';
  }

  const safe = raw.replace(/(LTAI)[A-Za-z0-9]+/gi, 'LTAI****').slice(0, 280);
  return code ? `${code}: ${safe}` : safe;
}

function createClient(cfg: OssRuntimeConfig): OSS {
  if (!cfg.accessKeyId || !cfg.accessKeySecret || !cfg.bucket) {
    throw new Error('OSS 未配置完整（AccessKeyId / AccessKeySecret / Bucket）');
  }

  const region = normalizeOssRegion(cfg.region);
  const opts: OSS.Options = {
    accessKeyId: cfg.accessKeyId,
    accessKeySecret: cfg.accessKeySecret,
    bucket: cfg.bucket,
    region,
    secure: true,
    timeout: 60_000,
  };

  // 自定义 Endpoint（内网 / 专有云）；CDN 域名用 cname
  const endpoint = (cfg.endpoint || '').trim();
  const cdn = (cfg.cdnDomain || '').trim();
  if (endpoint) {
    opts.endpoint = endpoint.replace(/^https?:\/\//i, '');
    opts.cname = Boolean(cfg.cname);
  } else if (cdn) {
    opts.endpoint = cdn.replace(/^https?:\/\//i, '');
    opts.cname = true;
  }

  return new OSS(opts);
}

export class OssStorageProvider implements StorageProvider {
  readonly id = 'oss' as const;
  readonly capabilities = CAPABILITIES;

  private _client: OSS | null = null;

  constructor(private readonly cfg: OssRuntimeConfig) {}

  private client(): OSS {
    if (!this._client) {
      this._client = createClient(this.cfg);
    }
    return this._client;
  }

  dispose() {
    this._client = null;
  }

  async getUploadUrl(key: string, contentType: string, expires = 300) {
    assertMediaKey(key);
    const client = this.client();
    const safeExpires = Math.min(Math.max(expires, 60), 600);
    const url = client.signatureUrl(key, {
      expires: safeExpires,
      method: 'PUT',
      'Content-Type': contentType,
    });
    return { url, viaSts: false };
  }

  async getSignedUrl(key: string, options?: SignOptions) {
    assertMediaKey(key);
    const client = this.client();
    const expires = Math.min(Math.max(options?.expires ?? 1800, 60), 3600);
    const process = buildImageProcess({
      ...options,
      thumbWidth: options?.thumbWidth ?? this.cfg.thumbWidth,
      watermarkText:
        options?.watermarkText ||
        (options?.watermark ? this.cfg.watermarkText : undefined),
    });

    const signOpts: OSS.SignatureUrlOptions = {
      expires,
      method: 'GET',
    };
    if (process) {
      signOpts.process = process;
    }

    let url = client.signatureUrl(key, signOpts);
    const publicBase = this.cfg.publicBaseUrl || (!this.cfg.cname ? this.cfg.cdnDomain : '');
    if (publicBase && !this.cfg.cname) {
      // 客户端未走 cname 时，可读链可替换公共域名
      url = applyPublicHost(url, publicBase);
    }
    return url;
  }

  async deleteObject(key: string) {
    assertMediaKey(key);
    await this.client().delete(key);
  }

  async headObjectSize(key: string): Promise<number | null> {
    assertMediaKey(key);
    try {
      const out = await this.client().head(key);
      const headers = (out.res?.headers || {}) as Record<string, string | undefined>;
      const fromHeader = Number(headers['content-length']);
      const fromMeta = Number((out.meta as { size?: number } | undefined)?.size);
      const size = Number.isFinite(fromHeader) ? fromHeader : fromMeta;
      return Number.isFinite(size) && size >= 0 ? size : null;
    } catch (err: unknown) {
      const e = err as { status?: number; code?: string };
      if (e.status === 404 || e.code === 'NoSuchKey') return null;
      throw err;
    }
  }

  async putObjectBuffer(key: string, body: Buffer, contentType: string) {
    assertMediaKey(key);
    await this.client().put(key, body, {
      headers: { 'Content-Type': contentType },
      mime: contentType,
    });
  }

  async getObjectBytes(key: string, headers?: { Range?: string }) {
    assertMediaKey(key);
    const opts: OSS.GetObjectOptions = {};
    if (headers?.Range) {
      opts.headers = { Range: headers.Range };
    }
    const out = await this.client().get(key, opts);
    const content = out.content;
    let bytes: Buffer;
    if (Buffer.isBuffer(content)) {
      bytes = content;
    } else if (content instanceof Uint8Array) {
      bytes = Buffer.from(content);
    } else if (typeof content === 'string') {
      bytes = Buffer.from(content);
    } else if (content && typeof (content as ArrayBuffer).byteLength === 'number') {
      bytes = Buffer.from(new Uint8Array(content as ArrayBuffer));
    } else {
      bytes = Buffer.alloc(0);
    }
    const resHeaders = (out.res?.headers || {}) as Record<string, string>;
    return {
      body: bytes,
      statusCode: headers?.Range ? 206 : 200,
      contentType: resHeaders['content-type'],
      contentLength: String(resHeaders['content-length'] ?? bytes.length),
      contentRange: resHeaders['content-range'],
      acceptRanges: resHeaders['accept-ranges'] || 'bytes',
    };
  }

  async initMultipartUpload(key: string, contentType: string) {
    assertMediaKey(key);
    const result = await this.client().initMultipartUpload(key, {
      mime: contentType,
      headers: { 'Content-Type': contentType },
    });
    if (!result.uploadId) throw new Error('OSS 初始化分片失败：无 uploadId');
    return { uploadId: result.uploadId, viaSts: false };
  }

  async getPartUploadUrl(
    key: string,
    uploadId: string,
    partNumber: number,
    expires = 600
  ) {
    assertMediaKey(key);
    const safeExpires = Math.min(Math.max(expires, 60), 600);
    const url = this.client().signatureUrl(key, {
      method: 'PUT',
      expires: safeExpires,
      subResource: {
        partNumber: String(partNumber),
        uploadId,
      },
    });
    return { url, viaSts: false };
  }

  async completeMultipartUpload(key: string, uploadId: string, parts: MultipartPart[]) {
    assertMediaKey(key);
    const normalized = parts
      .map((p) => ({
        number: Number(p.partNumber),
        etag: String(p.etag || '').replace(/^"|"$/g, ''),
      }))
      .filter((p) => p.number >= 1 && p.etag)
      .sort((a, b) => a.number - b.number);

    await this.client().completeMultipartUpload(key, uploadId, normalized);
  }

  async abortMultipartUpload(key: string, uploadId: string) {
    assertMediaKey(key);
    await this.client().abortMultipartUpload(key, uploadId);
  }

  async testConnection() {
    if (!this.cfg.accessKeyId || !this.cfg.accessKeySecret || !this.cfg.bucket) {
      return {
        ok: false,
        error: '配置不完整：需要 AccessKeyId / AccessKeySecret / Bucket',
        detail: this.cfg.bucket || undefined,
      };
    }

    const region = normalizeOssRegion(this.cfg.region);
    const detail = `${this.cfg.bucket} @ ${this.cfg.endpoint || region}`;

    try {
      const client = this.client();
      // getBucketInfo 验证凭证与桶
      await client.getBucketInfo(this.cfg.bucket);
      return { ok: true, detail };
    } catch (err: unknown) {
      // 部分账号无 GetBucketInfo 权限：回退探针对象 HEAD（404 也算通）
      try {
        await this.client().head('__cos_storage_probe_nonexistent__');
        return { ok: true, detail };
      } catch (err2: unknown) {
        const e = err2 as { status?: number; code?: string };
        if (e.status === 404 || e.code === 'NoSuchKey') {
          return { ok: true, detail };
        }
        return {
          ok: false,
          error: formatOssError(err),
          detail,
        };
      }
    }
  }
}
