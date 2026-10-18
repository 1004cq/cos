/**
 * 无服务端图片处理（S3 等）时：下载原图、用 sharp 生成小封面并写回存储。
 * 失败返回 null，不阻断上传主流程。
 */

import {
  getObjectBytes,
  getStorageProvider,
  putObjectBuffer,
} from '@/lib/storage';

export const DEFAULT_IMAGE_POSTER_TIMEOUT_MS = 15_000;
export const DEFAULT_IMAGE_POSTER_MAX_EDGE = 480;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * 为图片生成 JPEG 封面（最长边 maxEdge），写入 `${base}-poster.jpg`。
 * 仅在当前厂商不支持 imageProcess 时使用；COS 路径请继续用数据万象。
 */
export async function generateAndStoreImagePoster(
  imageKey: string,
  options?: { maxEdge?: number; timeoutMs?: number }
): Promise<string | null> {
  if (!imageKey.startsWith('media/')) return null;

  const provider = await getStorageProvider();
  if (provider.capabilities.imageProcess) {
    // COS 等已有服务端缩略，无需落盘 poster
    return null;
  }
  if (!provider.getObjectBytes || !provider.putObjectBuffer) {
    return null;
  }

  const maxEdge = Math.min(
    1200,
    Math.max(120, options?.maxEdge ?? DEFAULT_IMAGE_POSTER_MAX_EDGE)
  );
  const timeoutMs = options?.timeoutMs ?? DEFAULT_IMAGE_POSTER_TIMEOUT_MS;
  const base = imageKey.replace(/\.[^/.]+$/, '');
  const posterKey = `${base}-poster.jpg`;

  try {
    return await withTimeout(
      (async () => {
        const { body } = await getObjectBytes(imageKey);
        if (!body || body.length < 32) {
          console.warn('image poster source too small', imageKey);
          return null;
        }

        // sharp 为 Next 传递依赖；动态 import 避免边缘运行时硬失败
        const sharpMod = await import('sharp');
        const sharp = sharpMod.default;
        const out = await sharp(body)
          .rotate()
          .resize({
            width: maxEdge,
            height: maxEdge,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 78, mozjpeg: true })
          .toBuffer();

        if (out.length < 64) {
          console.warn('image poster output too small', imageKey);
          return null;
        }

        await putObjectBuffer(posterKey, out, 'image/jpeg');
        return posterKey;
      })(),
      timeoutMs,
      'image poster'
    );
  } catch (err) {
    console.warn('generateAndStoreImagePoster failed:', imageKey, err);
    return null;
  }
}
