'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, MoreHorizontal, X } from 'lucide-react';
import { mediaDisplayTitle } from '@/lib/utils';
import { formatWeekday, formatTimeOfDay, itemSortDate } from '@/lib/gallery-format';
import { cn } from '@/lib/utils';
import { PhotoViewerCarousel } from '@/components/photo-viewer-carousel';

export type LightboxItem = {
  id: string;
  url: string;
  key?: string;
  filename: string;
  title?: string | null;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  thumbUrl?: string | null;
  takenAt?: string | null;
  createdAt?: string;
  duration?: number | null;
};

function FilmstripThumb({ src }: { src?: string | null }) {
  const [failed, setFailed] = useState(!src);

  if (!src || failed) {
    return <div className="w-full h-full bg-[#E5E5EA]" aria-hidden />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      className="w-full h-full object-cover bg-[#E5E5EA]"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

type Props = {
  items: LightboxItem[];
  index: number;
  onClose: () => void;
  onChange: (index: number) => void;
  canDelete?: boolean;
  onDelete?: (id: string) => void;
  variant?: 'ios' | 'simple';
};

export function Lightbox({
  items,
  index,
  onClose,
  onChange,
  canDelete = false,
  onDelete,
  variant = 'ios',
}: Props) {
  const current = items[index];
  const [entered, setEntered] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [imageScale, setImageScale] = useState(1);
  const filmstripRef = useRef<HTMLDivElement>(null);

  const prev = useCallback(() => {
    if (index > 0) onChange(index - 1);
  }, [index, onChange]);

  const next = useCallback(() => {
    if (index < items.length - 1) onChange(index + 1);
  }, [index, items.length, onChange]);

  useEffect(() => {
    const t = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (imageScale !== 1) return;
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, prev, next, imageScale]);

  useEffect(() => {
    setInfoOpen(false);
    setMenuOpen(false);
    setImageScale(1);
  }, [index]);

  useEffect(() => {
    const strip = filmstripRef.current;
    if (!strip) return;
    strip.querySelector(`[data-thumb-index="${index}"]`)?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [index]);

  if (!current) return null;

  const isIos = variant === 'ios';
  const when = itemSortDate(current);
  const weekday = formatWeekday(when);
  const timeLabel = formatTimeOfDay(when);
  const title = mediaDisplayTitle(current.title, current.filename);

  async function handleShare() {
    const url = current.url;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        /* cancelled */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  }

  if (!isIos) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black/45 backdrop-blur-md">
        <PhotoViewerCarousel
          items={items}
          index={index}
          onChange={onChange}
          imageScale={1}
          onScaleChange={() => undefined}
          swipeEnabled
        />
        <div className="absolute top-4 right-4">
          <button type="button" onClick={onClose} className="btn-ghost !min-h-[44px] rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex flex-col bg-[#FFFFFF] photos-viewer-ios',
        entered ? 'photos-viewer-enter' : 'opacity-0'
      )}
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <header className="flex items-center justify-between gap-2 px-2 py-1.5 shrink-0 min-h-[48px] bg-white z-10">
        <button type="button" onClick={onClose} className="photos-icon-btn" aria-label="返回">
          <ChevronLeft className="w-6 h-6" strokeWidth={2.25} />
        </button>

        <button
          type="button"
          className="photos-date-capsule flex flex-col items-center px-4 py-1.5 min-w-[128px] transition-opacity duration-200"
          onClick={() => setInfoOpen((v) => !v)}
        >
          <span className="text-[13px] font-semibold leading-tight text-black">{weekday}</span>
          <span className="text-[11px] text-[var(--photos-muted)] leading-tight mt-0.5">
            {timeLabel}
          </span>
        </button>

        <button
          type="button"
          className="photos-icon-btn"
          aria-label="更多"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </header>

      {menuOpen && (
        <div
          className="absolute right-3 z-[60] rounded-xl bg-white/95 shadow-lg border border-black/5 py-1 min-w-[140px]"
          style={{ top: 'calc(env(safe-area-inset-top) + 48px)' }}
        >
          <button
            type="button"
            className="w-full text-left px-4 py-2.5 text-[15px] hover:bg-black/5"
            onClick={() => {
              setMenuOpen(false);
              void handleShare();
            }}
          >
            分享链接
          </button>
          {canDelete && onDelete ? (
            <button
              type="button"
              className="w-full text-left px-4 py-2.5 text-[15px] text-red-500 hover:bg-black/5"
              onClick={() => {
                setMenuOpen(false);
                if (confirm('确定删除？')) onDelete(current.id);
              }}
            >
              删除
            </button>
          ) : null}
        </div>
      )}

      {infoOpen && (
        <div className="mx-4 mb-1 px-4 py-3 rounded-2xl bg-[#F2F2F7] text-sm shrink-0 z-10">
          <p className="font-medium truncate">{title}</p>
          <p className="text-[var(--photos-muted)] mt-1 text-xs">
            {weekday} · {timeLabel}
          </p>
        </div>
      )}

      <PhotoViewerCarousel
        items={items}
        index={index}
        onChange={onChange}
        imageScale={imageScale}
        onScaleChange={setImageScale}
        swipeEnabled={imageScale === 1}
      />

      {items.length > 1 && (
        <div
          ref={filmstripRef}
          className="photos-filmstrip shrink-0 flex gap-1.5 px-3 py-2 overflow-x-auto no-scrollbar bg-white border-t border-black/[0.06]"
        >
          {items.map((item, i) => {
            const isVideo = item.mimeType.startsWith('video/');
            /** 缩略条只用 thumb；视频禁止用原片 URL 当 img */
            const thumb = item.thumbUrl || (isVideo ? null : item.url);
            const active = i === index;
            return (
              <button
                key={item.id}
                type="button"
                data-thumb-index={i}
                onClick={() => onChange(i)}
                className={cn(
                  'photos-filmstrip-thumb shrink-0 w-11 h-11 rounded-[6px] overflow-hidden border-2 transition-all duration-200 bg-[#E5E5EA]',
                  active
                    ? 'border-[#007AFF] opacity-100 scale-105'
                    : 'border-transparent opacity-50'
                )}
              >
                <FilmstripThumb src={thumb} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
