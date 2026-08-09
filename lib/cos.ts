import COS from 'cos-nodejs-sdk-v5';
import { getUploadStsCredential, isStsEnabled } from './sts';

const permanentCos = new COS({
  SecretId: process.env.COS_SECRET_ID!,
  SecretKey: process.env.COS_SECRET_KEY!,
});

const Bucket = process.env.COS_BUCKET!;
const Region = process.env.COS_REGION!;
const CDN = process.env.COS_CDN_DOMAIN; // 例如：陈庆.我爱你

/** 列表缩略图默认宽度（数据万象 imageMogr2） */
export const THUMB_WIDTH = Math.min(
  1200,
  Math.max(120, parseInt(process.env.COS_THUMB_WIDTH || '480', 10) || 480)
);

export type SignOptions = {
  /** 生成列表用缩略图（WebP），灯箱/下载勿开 */
  thumb?: boolean;
  /** 缩略图最大宽度，默认 COS_THUMB_WIDTH / 480 */
  thumbWidth?: number;
};

function applyCdnHost(url: string): string {
  if (!CDN) return url;
  try {
    const u = new URL(url);
    u.host = CDN;
    return u.toString();
  } catch {
    return url;
  }
}

function getObjectUrlWithClient(
  client: COS,
  key: string,
  method: 'GET' | 'PUT',
  expires: number,
  extra?: { headers?: Record<string, string>; query?: Record<string, string> }
): Promise<string> {
  return new Promise((resolve, reject) => {
    client.getObjectUrl(
      {
        Bucket,
        Region,
        Key: key,
        Method: method,
        Sign: true,
        Expires: expires,
        Headers: extra?.headers,
        Query: extra?.query,
      },
      (err, data) => {
        if (err) return reject(err);
        resolve(applyCdnHost(data.Url));
      }
    );
  });
}

/**
 * 生成上传预签名 URL（PUT）
 * 若 STS 可用：用临时密钥签名（长期 SecretKey 仅用于换票）
 * 否则：回退永久密钥签名
 */
export async function getUploadPresignedUrl(
  key: string,
  contentType: string,
  expires = 300
): Promise<{ url: string; viaSts: boolean }> {
  if (!key.startsWith('media/')) {
    throw new Error('非法的上传路径');
  }

  const safeExpires = Math.min(Math.max(expires, 60), 600);

  if (isStsEnabled()) {
    try {
      const sts = await getUploadStsCredential(Math.max(safeExpires + 60, 900));
      const tempCos = new COS({
        SecretId: sts.credentials.tmpSecretId,
        SecretKey: sts.credentials.tmpSecretKey,
        SecurityToken: sts.credentials.sessionToken,
      });
      const url = await getObjectUrlWithClient(tempCos, key, 'PUT', safeExpires, {
        headers: { 'Content-Type': contentType },
      });
      return { url, viaSts: true };
    } catch (err) {
      console.warn('STS 预签名失败，回退永久密钥:', err);
    }
  }

  const url = await getObjectUrlWithClient(permanentCos, key, 'PUT', safeExpires, {
    headers: { 'Content-Type': contentType },
  });
  return { url, viaSts: false };
}

/**
 * 生成访问签名 URL（GET）
 * thumb=true 时附带数据万象缩略参数（需桶开通图片处理）
 */
export async function getSignedUrl(
  key: string,
  expires = 1800,
  options?: SignOptions
): Promise<string> {
  if (!key.startsWith('media/')) {
    throw new Error('非法的对象键');
  }

  const safeExpires = Math.min(Math.max(expires, 60), 3600);
  const query: Record<string, string> = {};

  if (options?.thumb) {
    const w = options.thumbWidth ?? THUMB_WIDTH;
    // 限制最长边，转 WebP，降低列表带宽
    query[`imageMogr2/thumbnail/${w}x${w}>/format/webp`] = '';
  }

  return getObjectUrlWithClient(
    permanentCos,
    key,
    'GET',
    safeExpires,
    Object.keys(query).length > 0 ? { query } : undefined
  );
}

/**
 * 生成对象存储 key
 * 格式：media/年/月/日/时间戳-随机串.扩展名
 */
export function generateKey(filename: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : 'bin';
  const random = Math.random().toString(36).slice(2, 10);

  return `media/${y}/${m}/${d}/${Date.now()}-${random}.${ext}`;
}

/**
 * 删除 COS 对象（可选，管理端删除媒体时调用）
 */
export function deleteObject(key: string): Promise<void> {
  if (!key.startsWith('media/')) {
    return Promise.reject(new Error('非法的对象键'));
  }

  return new Promise((resolve, reject) => {
    permanentCos.deleteObject(
      {
        Bucket,
        Region,
        Key: key,
      },
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

export { permanentCos as cos, Bucket, Region };
