'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import {
  ChevronLeft,
  MoreHorizontal,
  Share,
  Heart,
  Info,
  SlidersHorizontal,
  Trash2,
  Loader2,
  X,
} from 'lucide-react';
import { fetchSignedUrl } from '@/lib/sign-client';
import { mediaDisplayTitle } from '@/lib/utils';
import { formatWeekday, formatTimeOfDay, itemSortDate } from '@/lib/gallery-format';
import { cn } from '@/lib/utils';

export type LightboxItem = {
  id: string;
  url: string;
  /** COS key：有则灯箱会按需拉原图（列表可先用缩略图） */
  key?: string;
  filename: string;
  title?: string | null;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  thumbUrl?: string;
  takenAt?: string | null;
  createdAt?: string;
  duration?: number | null;
};

type Props = {
  items: LightboxItem[];
  index: number;
  onClose: () => void;
  onChange: (index: number) => void;
  /** 管理员可删除 */
  canDelete?: boolean;
  onDelete?: (id: string) => void;
  /** iOS 照片风格（默认 true 于前台；后台可传 false 用简化顶栏） */
  variant?: 'ios' | 'simple';
};

function blockSave(e: React.SyntheticEvent) {
  e.preventDefault();
}

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
  const isVideo = current?.mimeType?.startsWith('video/');
  const [displayUrl, setDisplayUrl] = useState(current?.url || '');
  const [imgStatus, setImgStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [liked, setLiked] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
  const touchStartX = useRef<number | null>(null);
  const filmstripRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const prev = useCallback(() => {
    if (index > 0) {
      setSlideDir('right');
      onChange(index - 1);
    }
  }, [index, onChange]);

  const next = useCallback(() => {
    if (index < items.length - 1) {
      setSlideDir('left');
      onChange(index + 1);
    }
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

  useEffect(() => {
    if (!current) return;
    const initial = current.url || '';
    setDisplayUrl(initial);
    setImgStatus(initial ? 'loading' : 'error');
    setInfoOpen(false);
    setMenuOpen(false);

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

  useEffect(() => {
    const strip = filmstripRef.current;
    if (!strip) return;
    const thumb = strip.querySelector(`[data-thumb-index="${index}"]`);
    thumb?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [index]);

  useEffect(() => {
    if (!slideDir) return;
    const t = setTimeout(() => setSlideDir(null), 220);
    return () => clearTimeout(t);
  }, [index, slideDir]);

  if (!current) return null;

  const title = mediaDisplayTitle(current.title, current.filename);
  const when = itemSortDate(current);
  const weekday = formatWeekday(when);
  const timeLabel = formatTimeOfDay(when);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.changedTouches[0]?.clientX ?? null;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 48) return;
    if (delta > 0) prev();
    else next();
  }

  async function handleShare() {
    const url = displayUrl || current.url;
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

  const isIos = variant === 'ios';

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex flex-col photos-viewer',
        isIos ? 'bg-[#F2F2F7]' : 'bg-black/45 backdrop-blur-md'
      )}
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* 顶栏 */}
      <header
        className="flex items-center justify-between gap-2 px-2 py-2 shrink-0 min-h-[52px]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="photos-icon-btn"
          aria-label="返回"
        >
          <ChevronLeft className="w-6 h-6" strokeWidth={2.25} />
        </button>

        {isIos ? (
          <button
            type="button"
            className="photos-date-capsule flex flex-col items-center px-4 py-1.5 min-w-[120px]"
            onClick={() => setInfoOpen((v) => !v)}
          >
            <span className="text-[13px] font-semibold leading-tight">{weekday}</span>
            <span className="text-[11px] text-[var(--photos-muted)] leading-tight mt-0.5">
              {timeLabel}
            </span>
          </button>
        ) : (
          <span className="truncate flex-1 text-center text-sm font-medium px-2">{title}</span>
        )}

        <button
          type="button"
          className="photos-icon-btn"
          aria-label="更多"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </header>

      {menuOpen && isIos && (
        <div
          className="absolute right-3 z-[60] mt-12 rounded-xl bg-white/95 shadow-lg border border-black/5 py-1 min-w-[140px]"
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
        </div>
      )}

      {infoOpen && isIos && (
        <div className="mx-4 mb-2 px-4 py-3 rounded-2xl bg-white/90 text-sm shadow-sm shrink-0">
          <p className="font-medium truncate">{title}</p>
          <p className="text-[var(--photos-muted)] mt-1 text-xs">
            {weekday} · {timeLabel}
          </p>
          {current.mimeType && (
            <p className="text-[var(--photos-muted)] mt-0.5 text-xs">{current.mimeType}</p>
          )}
        </div>
      )}

      {/* 主图区 */}
      <div
        className="flex-1 relative flex items-center justify-center min-h-0 px-0 touch-pan-y overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onContextMenu={blockSave}
      >
        {index > 0 && (
          <button
            type="button"
            onClick={prev}
            className="hidden sm:flex absolute left-2 z-20 photos-icon-btn photos-icon-btn-lg"
            aria-label="上一张"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        <div
          className={cn(
            'w-full h-full flex items-center justify-center transition-opacity duration-200',
            slideDir ? 'opacity-90' : 'opacity-100'
          )}
        >
          {isVideo ? (
            <video
              ref={videoRef}
              key={current.id}
              src={current.url}
              controls
              controlsList="nodownload noplaybackrate noremoteplayback"
              disablePictureInPicture
              playsInline
              preload="metadata"
              className="max-h-full max-w-full w-auto h-auto object-contain bg-black/5"
              onContextMenu={blockSave}
            />
          ) : (
            <div className="relative w-full h-full flex items-center justify-center min-h-[40vh]">
              {imgStatus === 'loading' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-[#8E8E93]" />
                  <span className="text-sm text-[var(--photos-muted)]">加载中…</span>
                </div>
              )}
              {imgStatus === 'error' && (
                <p className="text-sm text-red-500">加载失败</p>
              )}
              {displayUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${current.id}-${displayUrl}`}
                  src={displayUrl}
                  alt={title}
                  className={cn(
                    'max-h-full max-w-full w-auto h-auto object-contain select-none no-save transition-opacity duration-200',
                    imgStatus === 'ready' ? 'opacity-100' : 'opacity-0'
                  )}
                  draggable={false}
                  onLoad={() => setImgStatus('ready')}
                  onError={() => setImgStatus('error')}
                  onContextMenu={blockSave}
                />
              ) : null}
            </div>
          )}
        </div>

        {index < items.length - 1 && (
          <button
            type="button"
            onClick={next}
            className="hidden sm:flex absolute right-2 z-20 photos-icon-btn photos-icon-btn-lg"
            aria-label="下一张"
          >
            <ChevronLeft className="w-6 h-6 rotate-180" />
          </button>
        )}
      </div>

      {/* 底部 filmstrip + 工具栏 */}
      {isIos && items.length > 1 && (
        <div
          ref={filmstripRef}
          className="photos-filmstrip shrink-0 flex gap-1.5 px-3 py-2 overflow-x-auto no-scrollbar"
        >
          {items.map((item, i) => {
            const thumb = item.thumbUrl || item.url;
            const active = i === index;
            return (
              <button
                key={item.id}
                type="button"
                data-thumb-index={i}
                onClick={() => onChange(i)}
                className={cn(
                  'photos-filmstrip-thumb shrink-0 w-11 h-11 rounded-md overflow-hidden border-2 transition-all',
                  active ? 'border-[#007AFF] opacity-100 scale-105' : 'border-transparent opacity-55'
                )}
              >
                {item.mimeType.startsWith('video/') ? (
                  <video
                    src={item.url}
                    className="w-full h-full object-cover pointer-events-none"
                    muted
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" className="w-full h-full object-cover" draggable={false} />
                )}
              </button>
            );
          })}
        </div>
      )}

      {isIos ? (
        <footer className="photos-toolbar shrink-0 flex items-center justify-around px-2 py-2 pb-[max(8px,env(safe-area-inset-bottom))]">
          <button type="button" className="photos-toolbar-btn" aria-label="分享" onClick={() => void handleShare()}>
            <Share className="w-[22px] h-[22px]" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="photos-toolbar-btn"
            aria-label="喜欢"
            onClick={() => setLiked((v) => !v)}
          >
            <Heart
              className={cn('w-[22px] h-[22px]', liked && 'fill-red-500 text-red-500')}
              strokeWidth={1.75}
            />
          </button>
          <button
            type="button"
            className="photos-toolbar-btn"
            aria-label="信息"
            onClick={() => setInfoOpen((v) => !v)}
          >
            <Info className="w-[22px] h-[22px]" strokeWidth={1.75} />
          </button>
          <button type="button" className="photos-toolbar-btn opacity-40" aria-label="编辑" disabled>
            <SlidersHorizontal className="w-[22px] h-[22px]" strokeWidth={1.75} />
          </button>
          {canDelete && onDelete ? (
            <button
              type="button"
              className="photos-toolbar-btn text-red-500"
              aria-label="删除"
              onClick={() => {
                if (confirm('确定删除？')) onDelete(current.id);
              }}
            >
              <Trash2 className="w-[22px] h-[22px]" strokeWidth={1.75} />
            </button>
          ) : (
            <button type="button" className="photos-toolbar-btn opacity-25" aria-label="删除" disabled>
              <Trash2 className="w-[22px] h-[22px]" strokeWidth={1.75} />
            </button>
          )}
        </footer>
      ) : (
        <div className="flex justify-end p-3">
          <button type="button" onClick={onClose} className="btn-ghost !min-h-[44px] rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
