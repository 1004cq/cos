'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, MoreHorizontal, X } from 'lucide-react';
import { mediaDisplayTitle } from '@/lib/utils';
import { formatWeekday, formatTimeOfDay, itemSortDate } from '@/lib/gallery-format';
import { cn } from '@/lib/utils';
import { PhotoViewerCarousel } from '@/components/photo-viewer-carousel';
import { PhotoViewerVideoBar } from '@/components/photo-viewer-video-bar';
import { MediaCover } from '@/components/media-cover';

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
  posterUrl?: string | null;
  takenAt?: string | null;
  createdAt?: string;
  duration?: number | null;
};

function FilmstripThumb({
  id,
  src,
  posterUrl,
  isVideo,
}: {
  id: string;
  src?: string | null;
  posterUrl?: string | null;
  isVideo?: boolean;
}) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <MediaCover
        id={`strip-${id}`}
        posterUrl={posterUrl}
        thumbUrl={isVideo ? null : src}
        isVideo={isVideo}
        showPlayBadge={isVideo}
        compact
        className="absolute inset-0"
      />
    </div>
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
  const [chromeVisible, setChromeVisible] = useState(true);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimerRef = useRef<number | null>(null);

  const prev = useCallback(() => {
    if (index > 0) onChange(index - 1);
  }, [index, onChange]);

  const next = useCallback(() => {
    if (index < items.length - 1) onChange(index + 1);
  }, [index, items.length, onChange]);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleAutoHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setChromeVisible(false);
      setMenuOpen(false);
      setInfoOpen(false);
    }, 2800);
  }, [clearHideTimer]);

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
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, prev, next, imageScale]);

  useEffect(() => {
    setInfoOpen(false);
    setMenuOpen(false);
    setImageScale(1);
    setChromeVisible(true);
    setVideoPlaying(false);
    clearHideTimer();
  }, [index, clearHideTimer]);

  /** 关闭灯箱：停播并卸掉 src，避免后台继续拉流 */
  useEffect(() => {
    return () => {
      const v = videoRef.current;
      if (!v) return;
      try {
        v.pause();
      } catch {
        /* ignore */
      }
      try {
        v.removeAttribute('src');
        v.load();
      } catch {
        /* ignore */
      }
    };
  }, []);

  useEffect(() => {
    if (videoPlaying && chromeVisible) {
      scheduleAutoHide();
    } else {
      clearHideTimer();
    }
    return clearHideTimer;
  }, [videoPlaying, chromeVisible, scheduleAutoHide, clearHideTimer]);

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
  const isVideo = current.mimeType.startsWith('video/');

  function toggleChrome() {
    setChromeVisible((v) => {
      const nextVisible = !v;
      if (nextVisible) {
        setMenuOpen(false);
      } else {
        setMenuOpen(false);
        setInfoOpen(false);
      }
      return nextVisible;
    });
  }

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
      <div className="photos-viewer-fs fixed inset-0 z-50 flex bg-white/90 backdrop-blur-md">
        <PhotoViewerCarousel
          items={items}
          index={index}
          onChange={onChange}
          imageScale={1}
          onScaleChange={() => undefined}
          swipeEnabled
          videoRef={videoRef}
        />
        <div className="absolute top-4 right-4 z-30">
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
        'photos-viewer-fs photos-viewer-ios fixed inset-0 z-50 bg-white',
        entered ? 'photos-viewer-enter' : 'opacity-0'
      )}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* 媒体层：占满全屏 */}
      <div className="photos-viewer-media absolute inset-0 z-0">
        <PhotoViewerCarousel
          items={items}
          index={index}
          onChange={onChange}
          imageScale={imageScale}
          onScaleChange={setImageScale}
          swipeEnabled={imageScale === 1}
          videoRef={videoRef}
          onMediaTap={toggleChrome}
        />
      </div>

      {/* 返回键：始终可见（白底圆形左箭头），不随 chrome 隐藏 */}
      <button
        type="button"
        onClick={onClose}
        className="photos-icon-btn-viewer absolute z-[35]"
        style={{
          top: 'max(12px, calc(env(safe-area-inset-top) + 8px))',
          left: '12px',
        }}
        aria-label="返回"
        onTouchStart={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <ChevronLeft className="w-5 h-5" strokeWidth={2.75} />
      </button>

      {/* 顶栏浮层：日期胶囊 + 更多（可随点击隐藏） */}
      <header
        className={cn(
          'photos-viewer-chrome-top absolute inset-x-0 top-0 z-30 flex items-center justify-end gap-2 px-2 py-1.5 min-h-[48px] transition-opacity duration-250',
          chromeVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* 占位：与左侧固定返回键对齐，让日期居中 */}
        <span className="w-9 h-9 shrink-0 opacity-0 pointer-events-none" aria-hidden />

        <button
          type="button"
          className="photos-date-capsule absolute left-1/2 -translate-x-1/2 flex flex-col items-center px-4 py-1.5 min-w-[128px] transition-opacity duration-200"
          style={{ top: 'max(10px, calc(env(safe-area-inset-top) + 6px))' }}
          onClick={() => setInfoOpen((v) => !v)}
        >
          <span className="text-[13px] font-semibold leading-tight text-black">{weekday}</span>
          <span className="text-[11px] text-[var(--photos-muted)] leading-tight mt-0.5">
            {timeLabel}
          </span>
        </button>

        <button
          type="button"
          className="photos-icon-btn-viewer"
          aria-label="更多"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MoreHorizontal className="w-5 h-5" strokeWidth={2.25} />
        </button>
      </header>

      {menuOpen && chromeVisible && (
        <div
          className="absolute right-3 z-[40] rounded-xl bg-white/95 shadow-lg border border-black/5 py-1 min-w-[140px]"
          style={{ top: 'calc(env(safe-area-inset-top) + 52px)' }}
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

      {infoOpen && chromeVisible && (
        <div
          className="absolute inset-x-4 z-30 px-4 py-3 rounded-2xl bg-[#F2F2F7]/95 text-sm shadow-sm"
          style={{ top: 'calc(env(safe-area-inset-top) + 56px)' }}
        >
          <p className="font-medium truncate">{title}</p>
          <p className="text-[var(--photos-muted)] mt-1 text-xs">
            {weekday} · {timeLabel}
          </p>
        </div>
      )}

      {/* 底栏浮层：不占文档流，不挤压媒体 */}
      <div
        className={cn(
          'photos-viewer-chrome-bottom absolute inset-x-0 bottom-0 z-30 flex flex-col transition-opacity duration-250',
          chromeVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (videoPlaying) scheduleAutoHide();
        }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        {isVideo && (
          <PhotoViewerVideoBar
            videoRef={videoRef}
            active
            onPlayingChange={setVideoPlaying}
          />
        )}

        {items.length > 1 && (
          <div
            ref={filmstripRef}
            className="photos-filmstrip flex gap-1.5 px-3 py-2 overflow-x-auto no-scrollbar"
          >
            {items.map((item, i) => {
              const itemVideo = item.mimeType.startsWith('video/');
              const thumb = item.posterUrl || item.thumbUrl || (itemVideo ? null : item.url);
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
                      ? 'border-white opacity-100 scale-105'
                      : 'border-transparent opacity-55'
                  )}
                >
                  <FilmstripThumb
                    id={item.id}
                    src={thumb}
                    posterUrl={item.posterUrl}
                    isVideo={itemVideo}
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
