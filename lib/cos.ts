import COS from 'cos-nodejs-sdk-v5';
import { getCosConfig, type CosRuntimeConfig } from './settings';

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

/** 仅 GET 可读时换 CDN；中文域不应配置在此 */
function applyCdnHost(url: string, cdnDomain: string): string {
  if (!cdnDomain) return url;
  const host = cdnDomain.replace(/^https?:\/\//, '').split('/')[0];
  if (!host || /[^\x00-\x7F]/.test(host)) return url;
  try {
    const u = new URL(url);
    u.host = host;
    return u.toString();
  } catch {
    return url;
  }
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
        if (method === 'GET' && cfg.cdnDomain) {
          url = applyCdnHost(url, cfg.cdnDomain);
        }
        resolve(url);
      }
    );
  });
}

export type SignOptions = {
  thumb?: boolean;
  thumbWidth?: number;
  snapshot?: boolean;
  snapshotTime?: number;
  /**
   * 是否叠加文字水印（展示链）。
   * true：用水印文案（options.watermarkText 或配置默认「陈庆.我爱你」）
   * false/省略：不加（管理端原图下载请勿传 true）
   */
  watermark?: boolean;
  watermarkText?: string;
  /**
   * 数据万象「图片样式」名。开启原图保护后必须带样式，否则 COS 返回
   * AccessDenied: The image can not be accessed, please use style.
   * 会签入 Query `style=<name>`。
   */
  style?: string;
};

export const SIGN_CONCURRENCY = 6;

/** 数据万象 URL 安全 Base64（+→-、/→_、去=） */
export function ciUrlSafeBase64(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function buildWatermarkRule(text: string): string {
  const t = text.trim() || '陈庆.我爱你';
  const textB64 = ciUrlSafeBase64(t);
  const fillB64 = ciUrlSafeBase64('#FFFFFF');
  // 右下角半透明白字；参数整体作为 Query key（value 空）以便签入签名
  return `watermark/2/text/${textB64}/fontsize/18/fill/${fillB64}/dissolve/55/gravity/southeast/dx/12/dy/12`;
}

/**
 * 上传预签名 PUT：强制 COS 源站 URL（不对 PUT 套 CDN）。
 * getObjectUrlWithClient 仅在 method===GET 时 applyCdnHost。
 */
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
  let url: string | null = null;
  let viaSts = false;

  if (stsModule?.isStsEnabled?.()) {
    try {
      const sts = await stsModule.getUploadStsCredential!(Math.max(safeExpires + 60, 900));
      const tempCos = new COS({
        SecretId: sts.credentials.tmpSecretId,
        SecretKey: sts.credentials.tmpSecretKey,
        SecurityToken: sts.credentials.sessionToken,
      });
      url = await getObjectUrlWithClient(tempCos, cfg, key, 'PUT', safeExpires, {
        headers: { 'Content-Type': contentType },
      });
      viaSts = true;
    } catch (err) {
      console.warn('STS 预签名失败，回退永久密钥:', err);
      url = null;
      viaSts = false;
    }
  }

  if (!url) {
    const client = createClient(cfg);
    url = await getObjectUrlWithClient(client, cfg, key, 'PUT', safeExpires, {
      headers: { 'Content-Type': contentType },
    });
  }

  assertPutUrlIsCosOrigin(url);
  return { url, viaSts };
}

/** 服务端兜底：PUT 必须是 myqcloud COS 源站，禁止 CDN/中文域 */
function assertPutUrlIsCosOrigin(url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new Error('生成的预签名 URL 无效');
  }
  if (!host || /[^\x00-\x7F]/.test(host) || host.includes('xn--')) {
    throw new Error('预签名 PUT 不可使用中文/IDN 域名');
  }
  const ok =
    (host.includes('.cos.') && host.endsWith('.myqcloud.com')) ||
    /^cos\.[a-z0-9-]+\.myqcloud\.com$/.test(host);
  if (!ok) {
    throw new Error('预签名 PUT 必须指向 COS 源站（不可用 CDN）');
  }
}

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

  const styleName = (options?.style || '').trim();

  if (options?.snapshot) {
    const t = options.snapshotTime ?? 0.1;
    query['ci-process'] = 'snapshot';
    query['time'] = String(t);
    query['format'] = 'jpg';
  } else if (styleName) {
    // 原图保护：必须用控制台预置样式名（处理规则写在样式里）
    query['style'] = styleName;
  } else {
    const parts: string[] = [];
    if (options?.thumb) {
      const w = options.thumbWidth ?? cfg.thumbWidth;
      parts.push(`imageMogr2/thumbnail/${w}x${w}>/format/jpg`);
    }
    if (options?.watermark) {
      const text = options.watermarkText?.trim() || cfg.watermarkText || '陈庆.我爱你';
      parts.push(buildWatermarkRule(text));
    }
    if (parts.length > 0) {
      // 缩略与水印用管道拼接，整段作为 query key 签入签名
      query[parts.join('|')] = '';
    }
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

export async function getObjectBytes(
  key: string,
  headers?: { Range?: string }
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
