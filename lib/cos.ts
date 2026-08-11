import COS from 'cos-nodejs-sdk-v5';
import { getCosConfig, type CosRuntimeConfig, isUnsafeCdnHost } from './settings';

// STS 可选：若项目有 lib/sts.ts 可再接入
let stsModule: {
  getUploadStsCredential?: (s: number) => Promise<any>;
  isStsEnabled?: () => boolean;
} | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  stsModule = require('./sts');
} catch {
  stsModule = null;
}

async function loadConfig(): Promise<CosRuntimeConfig> {
  const cfg = await getCosConfig();
  if (!cfg.secretId || !cfg.secretKey || !cfg.bucket || !cfg.region) {
    throw new Error('COS 未配置完整，请在后台「COS 设置」或 .env 中填写');
  }
  return cfg;
}

function createClient(cfg: CosRuntimeConfig, token?: string) {
  return new COS({
    SecretId: cfg.secretId,
    SecretKey: cfg.secretKey,
    ...(token ? { SecurityToken: token } : {}),
  });
}

/**
 * 仅用于「读取/播放」GET 签名换 CDN host。
 * PUT 绝不能换 host；中文/IDN 域名禁止当 CDN。
 */
export function applyCdnHost(url: string, cdnDomain: string): string {
  if (!cdnDomain) return url;
  const host = cdnDomain.replace(/^https?:\/\//, '').split('/')[0]?.trim() || '';
  if (!host || isUnsafeCdnHost(host)) return url;
  // 再拦一遍非 ASCII
  if (/[^\x00-\x7F]/.test(host)) return url;
  try {
    const u = new URL(url);
    u.host = host;
    return u.toString();
  } catch {
    return url;
  }
}

/** 数据万象文字水印：Base64 URL-safe（去 =，+/ → -_） */
export function ciUrlSafeBase64(text: string): string {
  return Buffer.from(text, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function getObjectUrlWithClient(
  client: COS,
  cfg: CosRuntimeConfig,
  key: string,
  method: 'GET' | 'PUT',
  expires: number,
  extra?: { headers?: Record<string, string>; query?: Record<string, string> }
): Promise<string> {
  return new Promise((resolve, reject) => {
    client.getObjectUrl(
      {
        Bucket: cfg.bucket,
        Region: cfg.region,
        Key: key,
        Method: method,
        Sign: true,
        Expires: expires,
        Headers: extra?.headers,
        Query: extra?.query,
      },
      (err, data) => {
        if (err) return reject(err);
        let url = data.Url;
        // CDN 仅绑定在 GET；PUT 始终 COS 源站
        if (method === 'GET' && cfg.cdnDomain) {
          url = applyCdnHost(url, cfg.cdnDomain);
        }
        resolve(url);
      }
    );
  });
}

export type SignOptions = {
  /** 图片缩略（imageMogr2） */
  thumb?: boolean;
  thumbWidth?: number;
  /** 视频封面帧（数据万象 ci-process=snapshot）——仅临时预览，持久封面请用 posterKey */
  snapshot?: boolean;
  /** 截帧时间（秒），默认 0.1 */
  snapshotTime?: number;
  /** 展示链文字水印（无法防录屏） */
  watermark?: boolean;
  /** 水印文案，默认「陈庆.我爱你」 */
  watermarkText?: string;
};

/** 图库/分享等批量签名的推荐并发上限 */
export const SIGN_CONCURRENCY = 6;

/** 列表签名默认 TTL（秒） */
export const GALLERY_SIGN_TTL = 3600;

/** 生成上传预签名 URL（PUT）——始终 COS 源站，不使用 CDN 域名 */
export async function getUploadPresignedUrl(
  key: string,
  contentType: string,
  expires = 300
): Promise<{ url: string; viaSts: boolean }> {
  if (!key.startsWith('media/')) {
    throw new Error('非法的上传路径');
  }

  const cfg = await loadConfig();
  const safeExpires = Math.min(Math.max(expires, 60), 600);

  if (stsModule?.isStsEnabled?.()) {
    try {
      const sts = await stsModule.getUploadStsCredential!(Math.max(safeExpires + 60, 900));
      const tempCos = new COS({
        SecretId: sts.credentials.tmpSecretId,
        SecretKey: sts.credentials.tmpSecretKey,
        SecurityToken: sts.credentials.sessionToken,
      });
      const url = await getObjectUrlWithClient(tempCos, cfg, key, 'PUT', safeExpires, {
        headers: { 'Content-Type': contentType },
      });
      return { url, viaSts: true };
    } catch (err) {
      console.warn('STS 预签名失败，回退永久密钥:', err);
    }
  }

  const client = createClient(cfg);
  const url = await getObjectUrlWithClient(client, cfg, key, 'PUT', safeExpires, {
    headers: { 'Content-Type': contentType },
  });
  return { url, viaSts: false };
}

function buildWatermarkQuery(text: string): string {
  // watermark/2 = 文字水印；参数必须进入签名 Query
  const t = ciUrlSafeBase64(text);
  const fill = ciUrlSafeBase64('#FFFFFF');
  return `watermark/2/text/${t}/fill/${fill}/fontsize/20/dissolve/40/gravity/southeast/dx/16/dy/16`;
}

/** 生成访问签名 URL（GET）——可读时换 CDN（ASCII 英文加速域） */
export async function getSignedUrl(
  key: string,
  expires = 1800,
  options?: SignOptions
): Promise<string> {
  if (!key.startsWith('media/')) {
    throw new Error('非法的对象键');
  }

  const cfg = await loadConfig();
  const safeExpires = Math.min(Math.max(expires, 60), 3600);
  const query: Record<string, string> = {};

  if (options?.snapshot) {
    const t = options.snapshotTime ?? 0.1;
    query['ci-process'] = 'snapshot';
    query['time'] = String(t);
    query['format'] = 'jpg';
  } else if (options?.thumb) {
    const w = options.thumbWidth ?? cfg.thumbWidth;
    // jpg 兼容更好；处理参数必须进签名
    query[`imageMogr2/thumbnail/${w}x${w}>/format/jpg`] = '';
  }

  if (options?.watermark) {
    const text = (options.watermarkText || '陈庆.我爱你').trim() || '陈庆.我爱你';
    query[buildWatermarkQuery(text)] = '';
  }

  const client = createClient(cfg);
  return getObjectUrlWithClient(
    client,
    cfg,
    key,
    'GET',
    safeExpires,
    Object.keys(query).length > 0 ? { query } : undefined
  );
}

export function generateKey(filename: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : 'bin';
  const random = Math.random().toString(36).slice(2, 10);
  return `media/${y}/${m}/${d}/${Date.now()}-${random}.${ext}`;
}

/** 由视频 key 推导海报对象键：xxx.mov → xxx-poster.jpg */
export function posterKeyForVideo(videoKey: string): string {
  const cleaned = videoKey.replace(/\.[^.]+$/, '');
  return `${cleaned}-poster.jpg`;
}

export async function deleteObject(key: string): Promise<void> {
  if (!key.startsWith('media/')) {
    throw new Error('非法的对象键');
  }

  const cfg = await loadConfig();
  const client = createClient(cfg);

  return new Promise((resolve, reject) => {
    client.deleteObject(
      { Bucket: cfg.bucket, Region: cfg.region, Key: key },
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

/** 读取 COS 对象字节大小（用于核对原文件是否无损入库） */
export async function headObjectSize(key: string): Promise<number | null> {
  if (!key.startsWith('media/')) {
    throw new Error('非法的对象键');
  }

  const cfg = await loadConfig();
  const client = createClient(cfg);

  return new Promise((resolve, reject) => {
    client.headObject(
      { Bucket: cfg.bucket, Region: cfg.region, Key: key },
      (err, data) => {
        if (err) return reject(err);
        const headers = (data?.headers || {}) as Record<string, string | number | undefined>;
        const raw =
          headers['content-length'] ??
          headers['Content-Length'] ??
          (data as { ContentLength?: string | number } | undefined)?.ContentLength;
        if (raw == null) return resolve(null);
        const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
        resolve(Number.isFinite(n) ? n : null);
      }
    );
  });
}

export async function getBucketRegion() {
  const cfg = await loadConfig();
  return { Bucket: cfg.bucket, Region: cfg.region, CDN: cfg.cdnDomain };
}

/** 服务端拉取对象流（cover-src 限流兜底；有 poster 时不应依赖） */
export async function getObjectStreamAsync(
  key: string,
  headers?: { Range?: string }
): Promise<NodeJS.ReadableStream> {
  if (!key.startsWith('media/')) {
    throw new Error('非法的对象键');
  }
  const cfg = await loadConfig();
  const client = createClient(cfg);
  const params: COS.GetObjectParams = {
    Bucket: cfg.bucket,
    Region: cfg.region,
    Key: key,
  };
  if (headers?.Range) {
    params.Headers = { Range: headers.Range };
  }
  return client.getObjectStream(params) as unknown as NodeJS.ReadableStream;
}

/** 带响应头的对象读取（支持 Range） */
export async function getObjectBytes(
  key: string,
  headers?: { Range?: string },
  query?: Record<string, string>
): Promise<{
  body: Buffer;
  statusCode: number;
  contentType?: string;
  contentLength?: string;
  contentRange?: string;
  acceptRanges?: string;
}> {
  if (!key.startsWith('media/')) {
    throw new Error('非法的对象键');
  }
  const cfg = await loadConfig();
  const client = createClient(cfg);
  const params: COS.GetObjectParams = {
    Bucket: cfg.bucket,
    Region: cfg.region,
    Key: key,
  };
  if (headers?.Range) {
    params.Headers = { Range: headers.Range };
  }
  if (query && Object.keys(query).length > 0) {
    params.Query = query;
  }
  const data = await client.getObject(params);
  const hdrs = (data.headers || {}) as Record<string, string>;
  const body = Buffer.isBuffer(data.Body)
    ? data.Body
    : Buffer.from(data.Body as ArrayBuffer);
  return {
    body,
    statusCode: data.statusCode || (headers?.Range ? 206 : 200),
    contentType: hdrs['content-type'] || hdrs['Content-Type'],
    contentLength: String(hdrs['content-length'] || hdrs['Content-Length'] || body.length),
    contentRange: hdrs['content-range'] || hdrs['Content-Range'],
    acceptRanges: hdrs['accept-ranges'] || hdrs['Accept-Ranges'] || 'bytes',
  };
}

/** 上传字节到 COS（海报 jpg 等） */
export async function putObjectBuffer(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  if (!key.startsWith('media/')) {
    throw new Error('非法的对象键');
  }
  const cfg = await loadConfig();
  const client = createClient(cfg);
  await new Promise<void>((resolve, reject) => {
    client.putObject(
      {
        Bucket: cfg.bucket,
        Region: cfg.region,
        Key: key,
        Body: body,
        ContentType: contentType,
      },
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

/**
 * 服务端用数据万象 CI snapshot 截帧并写入 *-poster.jpg。
 * 需桶已绑定数据万象 / 媒体处理；失败返回 null（不抛）。
 */
export async function generateAndStoreVideoPoster(videoKey: string): Promise<string | null> {
  if (!videoKey.startsWith('media/')) return null;
  try {
    const snap = await getObjectBytes(videoKey, undefined, {
      'ci-process': 'snapshot',
      time: '0.1',
      format: 'jpg',
    });
    if (!snap.body || snap.body.length < 32) {
      console.warn('CI snapshot empty:', videoKey);
      return null;
    }
    // 简单校验是否像 JPEG
    if (snap.body[0] !== 0xff || snap.body[1] !== 0xd8) {
      console.warn('CI snapshot not jpeg:', videoKey, snap.contentType);
      return null;
    }
    const posterKey = posterKeyForVideo(videoKey);
    await putObjectBuffer(posterKey, snap.body, 'image/jpeg');
    return posterKey;
  } catch (err) {
    console.warn('generateAndStoreVideoPoster failed:', videoKey, err);
    return null;
  }
}
