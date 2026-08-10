/** 客户端视频封面截帧（用于上传时从 File 生成海报；列表回退） */

const coverCache = new Map<string, string>();

export function getCachedVideoCover(id: string): string | null {
  return coverCache.get(id) || null;
}

export function setCachedVideoCover(id: string, url: string) {
  const prev = coverCache.get(id);
  if (prev && prev.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(prev);
    } catch {
      /* ignore */
    }
  }
  coverCache.set(id, url);
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('seek failed'));
    };
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    try {
      const d = video.duration;
      const t = Number.isFinite(d) && d > 0 ? Math.min(time, Math.max(0, d * 0.01)) : time;
      video.currentTime = t;
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}

function drawFrame(video: HTMLVideoElement): string | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const max = 480;
  const scale = Math.min(1, max / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  try {
    ctx.drawImage(video, 0, 0, cw, ch);
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch {
    // 跨域未 CORS 时 canvas 会被污染
    return null;
  }
}

/** 从本地 File 截取第一帧 → Blob（上传海报用，同源无 CORS 问题） */
export async function capturePosterBlobFromFile(file: File): Promise<Blob | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.src = objectUrl;

    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('video load failed'));
    });

    try {
      await seekVideo(video, 0.1);
    } catch {
      /* 部分格式无法 seek，仍尝试当前帧 */
    }

    const dataUrl = drawFrame(video);
    if (!dataUrl) return null;
    const res = await fetch(dataUrl);
    return res.blob();
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * 从远程/签名视频 URL 截帧；成功则写入 cache。
 * 失败返回 null（调用方可用 muted video 元素作视觉回退）。
 */
export async function captureCoverFromVideoUrl(
  id: string,
  videoUrl: string
): Promise<string | null> {
  const cached = coverCache.get(id);
  if (cached) return cached;

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.crossOrigin = 'anonymous';
  video.src = videoUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error('timeout')), 12000);
      video.onloadeddata = () => {
        window.clearTimeout(t);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(t);
        reject(new Error('load error'));
      };
    });
    try {
      await seekVideo(video, 0.1);
    } catch {
      /* ignore */
    }
    const dataUrl = drawFrame(video);
    if (!dataUrl) return null;
    setCachedVideoCover(id, dataUrl);
    return dataUrl;
  } catch {
    return null;
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}
