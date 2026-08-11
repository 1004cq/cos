'use client';

import { useEffect, useState } from 'react';
import { getCachedVideoCover } from '@/lib/video-poster';
import { cn } from '@/lib/utils';

type Props = {
  id: string;
  posterUrl?: string | null;
  thumbUrl?: string | null;
  isVideo?: boolean;
  showPlayBadge?: boolean;
  compact?: boolean;
  className?: string;
};

/**
 * 图库封面：优先 posterUrl → thumbUrl → 内存缓存 → 灰底+▶
 * 列表禁止挂整段 video / 原图（架构红线）。
 */
export function MediaCover({
  id,
  posterUrl,
  thumbUrl,
  isVideo = false,
  showPlayBadge = false,
  compact = false,
  className,
}: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const [coverDataUrl] = useState<string | null>(() =>
    isVideo ? getCachedVideoCover(id) : null
  );

  const imageSrc = !imgFailed
    ? posterUrl || thumbUrl || coverDataUrl || null
    : coverDataUrl;

  useEffect(() => {
    setImgFailed(false);
  }, [id, posterUrl, thumbUrl]);

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
      <span className={cn('relative block h-full w-full bg-zinc-800', className)}>
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

  // 明确降级：深灰 + ▶（不要蓝空框 / 系统默认灰）
  return (
    <span
      className={cn(
        'relative flex h-full w-full items-center justify-center bg-zinc-800 text-white/55',
        className
      )}
    >
      {isVideo ? (
        <svg
          viewBox="0 0 24 24"
          className={cn('fill-current opacity-90', compact ? 'h-5 w-5' : 'h-8 w-8')}
          aria-hidden
        >
          <path d="M8 5v14l11-7z" />
        </svg>
      ) : (
        <span className="block h-full w-full bg-zinc-800" />
      )}
      {playBadge}
    </span>
  );
}
