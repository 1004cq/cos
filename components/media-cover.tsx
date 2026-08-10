'use client';

import { useEffect, useRef, useState } from 'react';
import {
  captureCoverFromVideoUrl,
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
 * 封面：poster → thumb → canvas 缓存 → muted metadata 视频帧 → 灰底+▶
 * 列表禁止 preload=auto。
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
  const [imgFailed, setImgFailed] = useState(false);
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(() =>
    getCachedVideoCover(id)
  );
  const [videoFrameFailed, setVideoFrameFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const staticSrc =
    !imgFailed && (posterUrl || thumbUrl) ? posterUrl || thumbUrl! : null;

  useEffect(() => {
    setImgFailed(false);
    setVideoFrameFailed(false);
    setCoverDataUrl(getCachedVideoCover(id));
  }, [id, posterUrl, thumbUrl, videoUrl]);

  useEffect(() => {
    if (staticSrc || coverDataUrl || !videoUrl || !isVideo) return;
    let cancelled = false;
    void (async () => {
      const dataUrl = await captureCoverFromVideoUrl(id, videoUrl);
      if (cancelled || !dataUrl) return;
      setCoverDataUrl(dataUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [staticSrc, coverDataUrl, videoUrl, id, isVideo]);

  const onVideoLoaded = () => {
    const v = videoRef.current;
    if (!v || v.videoWidth === 0) return;
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

  if (staticSrc) {
    return (
      <span className={cn('relative block h-full w-full', className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={staticSrc}
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
      <span className={cn('relative block h-full w-full', className)}>
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
        className={cn(
          'relative block h-full w-full overflow-hidden bg-black',
          className
        )}
      >
        <video
          ref={videoRef}
          src={videoUrl}
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
          onLoadedData={onVideoLoaded}
          onSeeked={onVideoLoaded}
          onError={() => setVideoFrameFailed(true)}
          aria-hidden
        />
        {playBadge}
      </span>
    );
  }

  return (
    <span
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
