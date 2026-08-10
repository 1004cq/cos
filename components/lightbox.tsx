'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { fetchSignedUrl } from '@/lib/sign-client';
import { mediaDisplayTitle } from '@/lib/utils';

export type LightboxItem = {
  id: string;
  url: string;
  /** COS key：有则灯箱会按需拉原图（列表可先用缩略图） */
  key?: string;
  filename: string;
  /** 可选展示标题；顶栏优先 title || filename */
  title?: string | null;
  mimeType: string;
  width?: number | null;
  height?: number | null;
};

type Props = {
  items: LightboxItem[];
  index: number;
  onClose: () => void;
  onChange: (index: number) => void;
};

function blockSave(e: React.SyntheticEvent) {
  e.preventDefault();
}

export function Lightbox({ items, index, onClose, onChange }: Props) {
  const current = items[index];
  const isVideo = current?.mimeType?.startsWith('video/');
  const [displayUrl, setDisplayUrl] = useState(current?.url || '');
  const [imgStatus, setImgStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [playing, setPlaying] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const didSwipe = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const prev = useCallback(() => {
    if (index > 0) onChange(index - 1);
  }, [index, onChange]);

  const next = useCallback(() => {
    if (index < items.length - 1) onChange(index + 1);
  }, [index, items.length, onChange]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, prev, next]);

  // 列表可能是缩略图：灯箱按需换原图（画质策略不变）
  useEffect(() => {
    if (!current) return;
    const initial = current.url || '';
    setDisplayUrl(initial);
    setImgStatus(initial ? 'loading' : 'error');
    setPlaying(false);

    if (!current.key || isVideo) return;

    let cancelled = false;
    void fetchSignedUrl(current.key).then((url) => {
      if (cancelled || !url) return;
      setDisplayUrl(url);
      setImgStatus('loading');
    });

    return () => {
      cancelled = true;
    };
  }, [current, isVideo]);

  if (!current) return null;

  const title = mediaDisplayTitle(current.title, current.filename);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.changedTouches[0]?.clientX ?? null;
    didSwipe.current = false;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 50) return;
    didSwipe.current = true;
    if (delta > 0) prev();
    else next();
  }

  async function togglePlay(e: React.MouseEvent) {
    e.stopPropagation();
    if (didSwipe.current) {
      didSwipe.current = false;
      return;
    }
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      try {
        await el.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    } else {
      el.pause();
      setPlaying(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/45 backdrop-blur-md no-save"
      onClick={onClose}
      onContextMenu={blockSave}
      onDragStart={blockSave}
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div
        className="flex items-center justify-between gap-3 px-3 sm:px-4 py-3 text-sm glass-header text-[var(--text)] shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="truncate min-w-0 flex-1 font-medium text-[15px]">{title}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[var(--text-muted)] text-xs tabular-nums">
            {index + 1} / {items.length}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost !min-h-[44px] !min-w-[44px] !p-0 rounded-full"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div
        className="flex-1 flex items-center justify-center relative px-2 sm:px-4 pb-4 min-h-0 touch-pan-y"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onContextMenu={blockSave}
        onDragStart={blockSave}
      >
        {index > 0 && (
          <button
            type="button"
            onClick={prev}
            className="absolute left-1 sm:left-3 z-20 min-w-[44px] min-h-[44px] w-12 h-12 rounded-full glass-strong flex items-center justify-center shadow-lg"
            aria-label="上一张"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {isVideo ? (
          <div className="relative w-full max-w-4xl min-h-[40vh] max-h-[calc(100dvh-7.5rem)] flex items-center justify-center">
            <video
              ref={videoRef}
              key={current.id}
              src={current.url}
              controls
              controlsList="nodownload noplaybackrate noremoteplayback"
              disablePictureInPicture
              playsInline
              preload="metadata"
              className="max-h-[calc(100dvh-7.5rem)] max-w-full w-auto rounded-2xl shadow-2xl bg-black/20"
              onContextMenu={blockSave}
              onDragStart={blockSave}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                // 促发首帧，避免灰块
                if (v.currentTime < 0.05) {
                  try {
                    v.currentTime = 0.05;
                  } catch {
                    /* ignore */
                  }
                }
              }}
            />
            {!playing && (
              <button
                type="button"
                className="absolute inset-0 z-[1] flex items-center justify-center rounded-2xl"
                aria-label="播放"
                onClick={togglePlay}
              >
                <span className="w-16 h-16 min-w-[44px] min-h-[44px] rounded-full glass-strong flex items-center justify-center text-2xl shadow-lg pointer-events-none">
                  ▶
                </span>
              </button>
            )}
          </div>
        ) : (
          <div className="relative w-full max-w-5xl min-h-[50vh] max-h-[calc(100dvh-7.5rem)] flex items-center justify-center rounded-2xl overflow-hidden">
            {imgStatus === 'loading' && (
              <div
                className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 glass rounded-2xl min-h-[50vh]"
                aria-busy
              >
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  加载中…
                </span>
              </div>
            )}
            {imgStatus === 'error' && (
              <div className="absolute inset-0 z-10 flex items-center justify-center glass rounded-2xl min-h-[50vh]">
                <p className="text-sm text-red-500">加载失败</p>
              </div>
            )}
            {displayUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${current.id}-${displayUrl}`}
                src={displayUrl}
                alt={title}
                className="max-h-[calc(100dvh-7.5rem)] max-w-full w-auto h-auto object-contain rounded-2xl shadow-2xl select-none no-save"
                draggable={false}
                onLoad={() => setImgStatus('ready')}
                onError={() => setImgStatus('error')}
                onContextMenu={blockSave}
                onDragStart={blockSave}
              />
            ) : null}
          </div>
        )}

        {index < items.length - 1 && (
          <button
            type="button"
            onClick={next}
            className="absolute right-1 sm:right-3 z-20 min-w-[44px] min-h-[44px] w-12 h-12 rounded-full glass-strong flex items-center justify-center shadow-lg"
            aria-label="下一张"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  );
}
