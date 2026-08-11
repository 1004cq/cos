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
      window.clearTimeout(timer);
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('seek timeout'));
    }, 8000);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    try {
      const d = video.duration;
      const t =
        Number.isFinite(d) && d > 0 ? Math.min(Math.max(time, 0), Math.max(0, d - 0.05)) : time;
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
    return null;
  }
}

/** 从本地 File 截取帧 → Blob（上传海报用） */
export async function capturePosterBlobFromFile(file: File): Promise<Blob | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.preload = 'auto';
    video.src = objectUrl;

    await new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error('metadata timeout')), 15000);
      video.onloadeddata = () => {
        window.clearTimeout(t);
        resolve();
      };
      video.onloadedmetadata = () => {
        /* continue wait loadeddata */
      };
      video.onerror = () => {
        window.clearTimeout(t);
        reject(new Error('video load failed'));
      };
    });

    try {
      await video.play();
      video.pause();
    } catch {
      /* iOS 可能拦截，仍尝试 seek */
    }

    for (const t of [0.1, 0.5, 1, 0]) {
      try {
        await seekVideo(video, t);
        const dataUrl = drawFrame(video);
        if (dataUrl) {
          const res = await fetch(dataUrl);
          return res.blob();
        }
      } catch {
        /* try next time */
      }
    }

    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

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
