'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getCachedVideoCover,
  setCachedVideoCover,
} from '@/lib/video-poster';
import { cn } from '@/lib/utils';

type Props = {
  id: string;
  posterUrl?: string | null;
  thumbUrl?: string | null;
  /** 视频签名 URL：仅用于首帧（preload=metadata），不 preload 整段 */
  videoUrl?: string | null;
  isVideo?: boolean;
  showPlayBadge?: boolean;
  compact?: boolean;
  className?: string;
};

/**
 * 封面：真实海报/图片缩略 → 内存缓存 → 可见时用 muted 视频截首帧 → 灰底+▶
 * 视频不使用不可靠的 COS snapshot thumb。
 */
export function MediaCover({
  id,
  posterUrl,
  thumbUrl,
  videoUrl,
  isVideo = false,
  showPlayBadge = false,
  compact = false,
  className,
}: Props) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const paintedRef = useRef(false);

  const [imgFailed, setImgFailed] = useState(false);
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(() =>
    getCachedVideoCover(id)
  );
  const [videoFrameFailed, setVideoFrameFailed] = useState(false);
  const [inView, setInView] = useState(false);

  const imageSrc = !imgFailed
    ? posterUrl || (!isVideo ? thumbUrl || null : null)
    : null;

  useEffect(() => {
    setImgFailed(false);
    setVideoFrameFailed(false);
    paintedRef.current = false;
    setCoverDataUrl(getCachedVideoCover(id));
  }, [id, posterUrl, thumbUrl, videoUrl]);

  // 仅对进入视口的格子挂视频首帧，避免列表同时拉很多视频
  useEffect(() => {
    if (imageSrc || coverDataUrl || !isVideo || !videoUrl) return;
    const el = rootRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px', threshold: 0.01 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [imageSrc, coverDataUrl, isVideo, videoUrl]);

  const tryCaptureCanvas = (v: HTMLVideoElement) => {
    if (v.videoWidth === 0) return;
    try {
      const canvas = document.createElement('canvas');
      const maxW = 480;
      const scale = Math.min(1, maxW / v.videoWidth);
      canvas.width = Math.max(1, Math.round(v.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(v.videoHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      setCachedVideoCover(id, dataUrl);
      setCoverDataUrl(dataUrl);
    } catch {
      /* tainted canvas */
    }
  };

  useEffect(() => {
    if (
      imageSrc ||
      coverDataUrl ||
      !isVideo ||
      !videoUrl ||
      !inView ||
      videoFrameFailed
    ) {
      return;
    }
    const v = videoRef.current;
    if (!v) return;

    let cancelled = false;

    const paint = async () => {
      if (cancelled || paintedRef.current) return;
      try {
        v.muted = true;
        v.defaultMuted = true;
        v.playsInline = true;
        v.setAttribute('playsinline', '');
        v.setAttribute('webkit-playsinline', '');
        try {
          if (v.readyState >= 1) {
            const t =
              Number.isFinite(v.duration) && v.duration > 0
                ? Math.min(0.1, v.duration * 0.01)
                : 0.1;
            v.currentTime = t;
          }
        } catch {
          /* ignore */
        }
        try {
          await v.play();
        } catch {
          /* ignore */
        }
        if (cancelled) return;
        v.pause();
        paintedRef.current = true;
        tryCaptureCanvas(v);
      } catch {
        /* ignore */
      }
    };

    const onReady = () => {
      void paint();
      tryCaptureCanvas(v);
    };

    v.addEventListener('loadedmetadata', onReady);
    v.addEventListener('loadeddata', onReady);
    v.addEventListener('seeked', onReady);
    if (v.readyState >= 1) void paint();

    return () => {
      cancelled = true;
      v.removeEventListener('loadedmetadata', onReady);
      v.removeEventListener('loadeddata', onReady);
      v.removeEventListener('seeked', onReady);
      try {
        v.pause();
      } catch {
        /* ignore */
      }
    };
  }, [imageSrc, coverDataUrl, isVideo, videoUrl, inView, videoFrameFailed, id]);

  const playBadge =
    showPlayBadge && isVideo ? (
      <span
        className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center"
        aria-hidden
      >
        <span
          className={cn(
            'flex items-center justify-center rounded-full bg-black/35 text-white/90 backdrop-blur-[2px]',
            compact ? 'h-6 w-6' : 'h-9 w-9 sm:h-10 sm:w-10'
          )}
        >
          <svg
            viewBox="0 0 24 24"
            className={cn('ml-0.5 fill-current', compact ? 'h-3 w-3' : 'h-4 w-4')}
            aria-hidden
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </span>
    ) : null;

  if (imageSrc) {
    return (
      <span ref={rootRef} className={cn('relative block h-full w-full', className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setImgFailed(true)}
        />
        {playBadge}
      </span>
    );
  }

  if (coverDataUrl) {
    return (
      <span ref={rootRef} className={cn('relative block h-full w-full', className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverDataUrl}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
        {playBadge}
      </span>
    );
  }

  if (isVideo && videoUrl && !videoFrameFailed) {
    return (
      <span
        ref={rootRef}
        className={cn(
          'relative block h-full w-full overflow-hidden bg-zinc-800',
          className
        )}
      >
        {inView ? (
          <video
            ref={videoRef}
            src={videoUrl}
            muted
            playsInline
            preload="metadata"
            className="pointer-events-none h-full w-full object-cover"
            onError={() => setVideoFrameFailed(true)}
            aria-hidden
          />
        ) : (
          <span className="absolute inset-0 bg-zinc-800" />
        )}
        {playBadge}
      </span>
    );
  }

  return (
    <span
      ref={rootRef}
      className={cn(
        'relative flex h-full w-full items-center justify-center bg-zinc-800 text-white/50',
        className
      )}
    >
      {isVideo && (
        <svg
          viewBox="0 0 24 24"
          className={cn('fill-current opacity-80', compact ? 'h-5 w-5' : 'h-8 w-8')}
          aria-hidden
        >
          <path d="M8 5v14l11-7z" />
        </svg>
      )}
      {playBadge}
    </span>
  );
}
