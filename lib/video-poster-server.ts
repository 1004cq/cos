import { getSignedUrl, putObjectBuffer } from '@/lib/cos';

/**
 * 用数据万象同步截帧生成海报并写入 COS。
 * 需桶已开通媒体处理；失败返回 null（不抛给上传主流程）。
 */
export async function generateAndStoreVideoPoster(
  videoKey: string,
  options?: { time?: number }
): Promise<string | null> {
  if (!videoKey.startsWith('media/')) return null;

  const time = options?.time ?? 1;
  const base = videoKey.replace(/\.[^/.]+$/, '');
  const posterKey = `${base}-poster.jpg`;

  try {
    const snapshotUrl = await getSignedUrl(videoKey, 600, {
      snapshot: true,
      snapshotTime: time,
    });

    const res = await fetch(snapshotUrl, {
      method: 'GET',
      headers: { Accept: 'image/jpeg,image/*,*/*' },
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
  } catch (err) {
    console.warn('generateAndStoreVideoPoster failed:', videoKey, err);
    return null;
  }
}
