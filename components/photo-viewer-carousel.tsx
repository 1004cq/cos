'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePinch } from '@use-gesture/react';
import { Loader2 } from 'lucide-react';
import { mediaDisplayTitle } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { LightboxItem } from '@/components/lightbox';

function blockSave(e: React.SyntheticEvent) {
  e.preventDefault();
}

type SlideProps = {
  item: LightboxItem;
  active: boolean;
  imageScale: number;
  onScaleChange: (scale: number) => void;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
};

function ViewerSlide({ item, active, imageScale, onScaleChange, videoRef }: SlideProps) {
  const isVideo = item.mimeType.startsWith('video/');
  const thumbUrl = item.thumbUrl || null;
  const fullUrl = item.url || '';
  const [displayUrl, setDisplayUrl] = useState(thumbUrl || fullUrl);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(() =>
    thumbUrl ? 'ready' : fullUrl ? 'loading' : 'error'
  );
  const [showSpinner, setShowSpinner] = useState(!thumbUrl && Boolean(fullUrl));
  const [posterFailed, setPosterFailed] = useState(false);
  const lastTapRef = useRef(0);
  const pinchStartScale = useRef(1);

  useEffect(() => {
    if (!active || isVideo) return;
    onScaleChange(1);

    const thumb = item.thumbUrl || null;
    const full = item.url || '';
    let cancelled = false;
    let probe: HTMLImageElement | null = null;

    if (thumb) {
      setDisplayUrl(thumb);
      setStatus('ready');
      setShowSpinner(Boolean(full && full !== thumb));
    } else if (full) {
      setDisplayUrl(full);
      setStatus('loading');
      setShowSpinner(true);
    } else {
      setDisplayUrl('');
      setStatus('error');
      setShowSpinner(false);
      return;
    }

    if (!full || full === thumb) {
      setShowSpinner(false);
      return;
    }

    probe = new Image();
    probe.onload = () => {
      if (cancelled) return;
      setDisplayUrl(full);
      setStatus('ready');
      setShowSpinner(false);
    };
    probe.onerror = () => {
      if (cancelled) return;
      if (thumb) {
        setDisplayUrl(thumb);
        setStatus('error');
      } else {
        setStatus('error');
      }
      setShowSpinner(false);
    };
    probe.src = full;

    return () => {
      cancelled = true;
      if (probe) {
        probe.onload = null;
        probe.onerror = null;
        probe.src = '';
      }
    };
  }, [item.id, item.url, item.thumbUrl, isVideo, active, onScaleChange]);

  const bindPinch = usePinch(
    ({ offset: [s], first, last, event }) => {
      if (!active || isVideo) return;
      if (first) {
        pinchStartScale.current = imageScale;
        event?.stopPropagation();
      }
      const next = Math.min(3.5, Math.max(1, pinchStartScale.current * s));
      onScaleChange(next);
      if (last) {
        onScaleChange(next < 1.15 ? 1 : next);
      }
    },
    { pointer: { touch: true }, scaleBounds: { min: 0.5, max: 3.5 }, rubberband: 0.1 }
  );

  function onDoubleClick(e: React.MouseEvent) {
    if (isVideo) return;
    e.stopPropagation();
    onScaleChange(imageScale > 1 ? 1 : 2);
  }

  function onTouchEndZoom(e: React.TouchEvent) {
    if (isVideo) return;
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      e.preventDefault();
      onScaleChange(imageScale > 1 ? 1 : 2);
    }
    lastTapRef.current = now;
  }

  if (isVideo) {
    return (
      <div
        className="photos-viewer-slide relative w-full h-full bg-black"
      >
        {active ? (
          <video
            ref={videoRef}
            src={fullUrl || undefined}
            poster={!posterFailed && thumbUrl ? thumbUrl : undefined}
            playsInline
            preload="metadata"
            controls={false}
            controlsList="nodownload noplaybackrate noremoteplayback"
            disablePictureInPicture
            className="photos-viewer-media-el absolute inset-0 w-full h-full object-contain"
            onContextMenu={blockSave}
          />
        ) : thumbUrl && !posterFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt=""
            className="photos-viewer-media-el absolute inset-0 w-full h-full object-contain bg-black"
            draggable={false}
            onError={() => setPosterFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 bg-[#1C1C1E]" />
        )}
      </div>
    );
  }

  const title = mediaDisplayTitle(item.title, item.filename);

  return (
    <div
      {...(active ? bindPinch() : {})}
      className="photos-viewer-slide relative w-full h-full bg-black touch-none select-none"
      onDoubleClick={onDoubleClick}
      onTouchEnd={onTouchEndZoom}
      onContextMenu={blockSave}
    >
      {showSpinner && active && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none z-[1]">
          <Loader2 className="w-8 h-8 animate-spin text-[#8E8E93]" />
        </div>
      )}
      {status === 'error' && active && !displayUrl && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#1C1C1E]">
          <div className="w-24 h-24 rounded-2xl bg-[#2C2C2E]" />
          <p className="text-sm text-red-400 pointer-events-none">加载失败</p>
        </div>
      )}
      {status === 'error' && active && displayUrl && (
        <p className="absolute bottom-[18%] left-0 right-0 text-center text-sm text-red-400 pointer-events-none z-[2]">
          加载失败
        </p>
      )}
      {displayUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={displayUrl}
          alt={title}
          draggable={false}
          className={cn(
            'photos-viewer-media-el absolute inset-0 w-full h-full object-contain no-save will-change-transform',
            status === 'error' && !item.thumbUrl ? 'opacity-0' : 'opacity-100'
          )}
          style={{
            transform: active ? `scale(${imageScale})` : undefined,
            transition: imageScale === 1 ? 'transform 0.25s ease-out' : 'none',
          }}
          onLoad={() => {
            if (displayUrl === fullUrl || !fullUrl) {
              setStatus((s) => (s === 'error' ? s : 'ready'));
              setShowSpinner(false);
            }
          }}
          onError={() => {
            if (displayUrl === thumbUrl && fullUrl && fullUrl !== thumbUrl) {
              setDisplayUrl(fullUrl);
              setStatus('loading');
              return;
            }
            setStatus('error');
            setShowSpinner(false);
            if (displayUrl === thumbUrl) setDisplayUrl('');
          }}
          onContextMenu={blockSave}
        />
      )}
    </div>
  );
}

type CarouselProps = {
  items: LightboxItem[];
  index: number;
  onChange: (index: number) => void;
  imageScale: number;
  onScaleChange: (scale: number) => void;
  swipeEnabled: boolean;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  onMediaTap?: () => void;
};

export function PhotoViewerCarousel({
  items,
  index,
  onChange,
  imageScale,
  onScaleChange,
  swipeEnabled,
  videoRef: videoRefProp,
  onMediaTap,
}: CarouselProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const videoRef = videoRefProp ?? internalVideoRef;
  const [vw, setVw] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 0
  );
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchRef = useRef({ x0: 0, y0: 0, axis: null as 'x' | 'y' | null, moved: false });

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setVw(el.clientWidth || window.innerWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setDragX(0);
    onScaleChange(1);
    const v = videoRef.current;
    if (v) {
      v.pause();
      try {
        v.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
  }, [index, onScaleChange, videoRef]);

  const commit = useCallback(
    (nextIndex: number, animateTo: number) => {
      setDragX(animateTo);
      window.setTimeout(() => {
        onChange(nextIndex);
        setDragX(0);
      }, 280);
    },
    [onChange]
  );

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    touchRef.current = { x0: t.clientX, y0: t.clientY, axis: null, moved: false };
    if (!swipeEnabled || imageScale !== 1) return;
    setIsDragging(true);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!swipeEnabled || imageScale !== 1) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - touchRef.current.x0;
    const dy = t.clientY - touchRef.current.y0;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) touchRef.current.moved = true;
    if (!touchRef.current.axis) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) touchRef.current.axis = 'x';
      else if (Math.abs(dy) > 10) touchRef.current.axis = 'y';
    }
    if (touchRef.current.axis !== 'x') return;

    let offset = dx;
    if (index === 0 && offset > 0) offset *= 0.32;
    if (index === items.length - 1 && offset < 0) offset *= 0.32;
    setDragX(offset);
  }

  function onTouchEnd() {
    setIsDragging(false);

    const wasTap = !touchRef.current.moved && touchRef.current.axis == null;
    if (wasTap) {
      onMediaTap?.();
      touchRef.current.axis = null;
      return;
    }

    if (!swipeEnabled || imageScale !== 1 || touchRef.current.axis !== 'x') {
      if (dragX !== 0) setDragX(0);
      touchRef.current.axis = null;
      return;
    }

    const threshold = Math.max(56, vw * 0.18);
    if (dragX < -threshold && index < items.length - 1) {
      commit(index + 1, -vw);
    } else if (dragX > threshold && index > 0) {
      commit(index - 1, vw);
    } else {
      setDragX(0);
    }
    touchRef.current.axis = null;
  }

  const indices = [index - 1, index, index + 1].filter((i) => i >= 0 && i < items.length);
  const trackWidth = vw * indices.length;
  const baseOffset = indices.indexOf(index) * vw;

  return (
    <div
      ref={viewportRef}
      className="photos-viewer-carousel absolute inset-0 w-full h-full overflow-hidden bg-black touch-pan-y"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onClick={() => {
        // desktop / mouse
        if (!('ontouchstart' in window)) onMediaTap?.();
      }}
    >
      {vw > 0 && (
        <div
          className="flex h-full"
          style={{
            width: trackWidth || '100%',
            height: '100%',
            transform: `translateX(${-baseOffset + dragX}px)`,
            transition: isDragging ? 'none' : 'transform 0.28s ease-out',
          }}
        >
          {indices.map((i) => (
            <div
              key={items[i]!.id}
              className="h-full shrink-0 relative"
              style={{ width: vw, height: '100%' }}
            >
              <ViewerSlide
                item={items[i]!}
                active={i === index}
                imageScale={i === index ? imageScale : 1}
                onScaleChange={onScaleChange}
                videoRef={videoRef}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
