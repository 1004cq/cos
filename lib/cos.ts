import COS from 'cos-nodejs-sdk-v5';
import { getCosConfig, type CosRuntimeConfig } from './settings';

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

/** 仅用于「读取/播放」签名；上传 PUT 绝不能换 host，否则会 404 */
function applyCdnHost(url: string, cdnDomain: string): string {
  if (!cdnDomain) return url;
  const host = cdnDomain.replace(/^https?:\/\//, '').split('/')[0];
  if (!host) return url;
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
        // 签名始终返回 COS 源站 URL；CDN 保持空，避免错 host 导致灰块/404
        resolve(data.Url);
      }
    );
  });
}

export type SignOptions = {
  /** 图片缩略（imageMogr2） */
  thumb?: boolean;
  thumbWidth?: number;
  /** 视频封面帧（数据万象 ci-process=snapshot） */
  snapshot?: boolean;
  /** 截帧时间（秒），默认 0.1 */
  snapshotTime?: number;
};

/** 图库/分享等批量签名的推荐并发上限 */
export const SIGN_CONCURRENCY = 6;

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

/** 生成访问签名 URL（GET）——可读时再换 CDN */
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
    // jpg 比 webp 兼容更好，避免部分环境缩略失败成灰块
    query[`imageMogr2/thumbnail/${w}x${w}>/format/jpg`] = '';
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
