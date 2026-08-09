'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
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

  // 列表可能是缩略图：灯箱按需换原图
  useEffect(() => {
    if (!current) return;
    setDisplayUrl(current.url);
    setPlaying(false);

    if (!current.key || isVideo) return;

    let cancelled = false;
    void fetchSignedUrl(current.key).then((url) => {
      if (!cancelled && url) setDisplayUrl(url);
    });

    return () => {
      cancelled = true;
    };
  }, [current, isVideo]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !isVideo) return;
    void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [current?.id, isVideo]);

  if (!current) return null;

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
      className="fixed inset-0 z-50 flex flex-col bg-black/40 backdrop-blur-md no-save"
      onClick={onClose}
      onContextMenu={blockSave}
      onDragStart={blockSave}
    >
      <div
        className="flex items-center justify-between px-4 py-3 text-sm glass-header text-[var(--text)]"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="truncate max-w-[50%] font-medium">
          {mediaDisplayTitle(current.title, current.filename)}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-muted)] text-xs">
            {index + 1} / {items.length}
          </span>
          <button onClick={onClose} className="btn-ghost !py-1.5 !px-3 text-sm">
            关闭
          </button>
        </div>
      </div>

      <div
        className="flex-1 flex items-center justify-center relative px-2 pb-4 touch-pan-y"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onContextMenu={blockSave}
        onDragStart={blockSave}
      >
        {index > 0 && (
          <button
            onClick={prev}
            className="absolute left-2 md:left-6 z-10 w-11 h-11 rounded-full glass-strong flex items-center justify-center text-xl"
            aria-label="上一张"
          >
            ‹
          </button>
        )}

        {isVideo ? (
          <div className="relative max-h-[calc(100vh-100px)] max-w-full w-full flex items-center justify-center">
            {/* 无原生 controls，避免系统「下载/保存视频」入口；全画质签名 URL 不变 */}
            <video
              ref={videoRef}
              key={current.id}
              src={current.url}
              controls={false}
              controlsList="nodownload noplaybackrate noremoteplayback"
              disablePictureInPicture
              playsInline
              preload="metadata"
              className="max-h-[calc(100vh-100px)] max-w-full rounded-2xl shadow-2xl"
              onContextMenu={blockSave}
              onDragStart={blockSave}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
            />
            <button
              type="button"
              className="absolute inset-0 z-[1] flex items-center justify-center rounded-2xl"
              aria-label={playing ? '暂停' : '播放'}
              onClick={togglePlay}
              onContextMenu={blockSave}
            >
              {!playing && (
                <span className="w-14 h-14 rounded-full glass-strong flex items-center justify-center text-xl pointer-events-none">
                  ▶
                </span>
              )}
            </button>
          </div>
        ) : (
          <div
            key={`${current.id}-${displayUrl}`}
            role="img"
            aria-label={current.filename}
            className="max-h-[calc(100vh-100px)] w-full max-w-full min-h-[40vh] rounded-2xl shadow-2xl bg-contain bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${JSON.stringify(displayUrl)})` }}
            onContextMenu={blockSave}
            onDragStart={blockSave}
          />
        )}

        {index < items.length - 1 && (
          <button
            onClick={next}
            className="absolute right-2 md:right-6 z-10 w-11 h-11 rounded-full glass-strong flex items-center justify-center text-xl"
            aria-label="下一张"
          >
            ›
          </button>
        )}
      </div>
    </div>
  );
}
