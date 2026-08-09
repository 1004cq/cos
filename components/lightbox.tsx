'use client';

import { useEffect, useCallback } from 'react';

export type LightboxItem = {
  id: string;
  url: string;
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
    // 禁止背景滚动
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, prev, next]);

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      onClick={onClose}
    >
      {/* 顶栏 */}
      <div
        className="flex items-center justify-between px-4 py-3 text-white/90 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="truncate max-w-[60%]">{current.filename}</span>
        <div className="flex items-center gap-3">
          <span>
            {index + 1} / {items.length}
          </span>
          <a
            href={current.url}
            download={current.filename}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 transition"
            onClick={(e) => e.stopPropagation()}
          >
            下载
          </a>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 transition"
          >
            关闭
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div
        className="flex-1 flex items-center justify-center relative px-2 pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 上一张 */}
        {index > 0 && (
          <button
            onClick={prev}
            className="absolute left-2 md:left-6 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-xl"
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
            className="max-h-[calc(100vh-100px)] max-w-full rounded"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={current.id}
            src={current.url}
            alt={current.filename}
            className="max-h-[calc(100vh-100px)] max-w-full object-contain select-none"
            draggable={false}
          />
        )}

        {/* 下一张 */}
        {index < items.length - 1 && (
          <button
            onClick={next}
            className="absolute right-2 md:right-6 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-xl"
            aria-label="下一张"
          >
            ›
          </button>
        )}
      </div>
    </div>
  );
}