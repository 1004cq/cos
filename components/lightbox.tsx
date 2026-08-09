'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { fetchSignedUrl } from '@/lib/sign-client';

export type LightboxItem = {
  id: string;
  url: string;
  /** COS key：有则灯箱会按需拉原图（列表可先用缩略图） */
  key?: string;
  filename: string;
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

export function Lightbox({ items, index, onClose, onChange }: Props) {
  const current = items[index];
  const isVideo = current?.mimeType?.startsWith('video/');
  const [displayUrl, setDisplayUrl] = useState(current?.url || '');
  const touchStartX = useRef<number | null>(null);

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

    if (!current.key || isVideo) return;

    let cancelled = false;
    void fetchSignedUrl(current.key).then((url) => {
      if (!cancelled && url) setDisplayUrl(url);
    });

    return () => {
      cancelled = true;
    };
  }, [current, isVideo]);

  if (!current) return null;

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.changedTouches[0]?.clientX ?? null;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 50) return;
    if (delta > 0) prev();
    else next();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40 backdrop-blur-md" onClick={onClose}>
      <div
        className="flex items-center justify-between px-4 py-3 text-sm glass-header text-[var(--text)]"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="truncate max-w-[50%] font-medium">{current.filename}</span>
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-muted)] text-xs">
            {index + 1} / {items.length}
          </span>
          <a
            href={displayUrl}
            download={current.filename}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost !py-1.5 !px-3 text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            下载
          </a>
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
          <video
            key={current.id}
            src={current.url}
            controls
            autoPlay
            playsInline
            preload="metadata"
            className="max-h-[calc(100vh-100px)] max-w-full rounded-2xl shadow-2xl"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${current.id}-${displayUrl}`}
            src={displayUrl}
            alt={current.filename}
            className="max-h-[calc(100vh-100px)] max-w-full object-contain select-none rounded-2xl shadow-2xl"
            draggable={false}
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
