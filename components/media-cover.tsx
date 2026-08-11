'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  id: string;
  posterUrl?: string | null;
  thumbUrl?: string | null;
  /** 保留兼容旧调用签名，网格不再使用 */
  videoUrl?: string | null;
  isVideo?: boolean;
  showPlayBadge?: boolean;
  compact?: boolean;
  className?: string;
};

/**
 * 封面：posterUrl → thumbUrl（图片） → 深灰+▶（视频无海报）
 * 网格不再挂视频元素拉流；海报由上传时截帧或服务端 CI 截帧持久化。
 */
export function MediaCover({
  id: _id,
  posterUrl,
  thumbUrl,
  videoUrl: _videoUrl,
  isVideo = false,
  showPlayBadge = false,
  compact = false,
  className,
}: Props) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const imageSrc = !imgFailed
    ? posterUrl || (!isVideo ? thumbUrl || null : null)
    : null;

  useEffect(() => {
    setImgFailed(false);
  }, [posterUrl, thumbUrl]);

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
