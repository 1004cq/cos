import { getSignedUrl, putObjectBuffer } from '@/lib/cos';

/** 上传入库路径默认短超时，避免 CI 截帧堵死整次上传 */
export const DEFAULT_POSTER_TIMEOUT_MS = 12_000;

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
 * 用数据万象同步截帧生成海报并写入 COS。
 * 需桶已开通媒体处理；失败或超时返回 null（不抛给上传主流程）。
 */
export async function generateAndStoreVideoPoster(
  videoKey: string,
  options?: { time?: number; timeoutMs?: number }
): Promise<string | null> {
  if (!videoKey.startsWith('media/')) return null;

  const time = options?.time ?? 1;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_POSTER_TIMEOUT_MS;
  const base = videoKey.replace(/\.[^/.]+$/, '');
  const posterKey = `${base}-poster.jpg`;

  try {
    return await withTimeout(
      (async () => {
        const snapshotUrl = await getSignedUrl(videoKey, 600, {
          snapshot: true,
          snapshotTime: time,
        });

        const res = await fetch(snapshotUrl, {
          method: 'GET',
          headers: { Accept: 'image/jpeg,image/*,*/*' },
          signal: AbortSignal.timeout(Math.max(1_000, timeoutMs - 500)),
        });

        if (!res.ok) {
          console.warn('CI snapshot HTTP', res.status, videoKey);
          return null;
        }

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('json') || contentType.includes('xml')) {
          const text = await res.text();
          console.warn('CI snapshot non-image:', text.slice(0, 200));
          return null;
        }

        const ab = await res.arrayBuffer();
        const buf = Buffer.from(ab);
        if (buf.length < 128) {
          console.warn('CI snapshot too small', buf.length, videoKey);
          return null;
        }

        // JPEG SOI 或 PNG 头简单校验
        const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
        const isPng = buf[0] === 0x89 && buf[1] === 0x50;
        if (!isJpeg && !isPng) {
          console.warn('CI snapshot not image magic', videoKey);
          return null;
        }

        await putObjectBuffer(posterKey, buf, isPng ? 'image/png' : 'image/jpeg');
        return posterKey;
      })(),
      timeoutMs,
      'CI video poster'
    );
  } catch (err) {
    console.warn('generateAndStoreVideoPoster failed:', videoKey, err);
    return null;
  }
}
