'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePinch } from '@use-gesture/react';
import { Loader2 } from 'lucide-react';
import { fetchSignedUrl } from '@/lib/sign-client';
import { mediaDisplayTitle } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { LightboxItem } from '@/components/lightbox';
import { PhotoViewerVideoBar } from '@/components/photo-viewer-video-bar';

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
  const [displayUrl, setDisplayUrl] = useState(item.url);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const lastTapRef = useRef(0);
  const pinchStartScale = useRef(1);

  useEffect(() => {
    if (!active) return;
    setDisplayUrl(item.url);
    setStatus(item.url ? 'loading' : 'error');
    onScaleChange(1);

    if (!item.key || isVideo) return;
    let cancelled = false;
    void fetchSignedUrl(item.key).then((url) => {
      if (!cancelled && url) {
        setDisplayUrl(url);
        setStatus('loading');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [item.id, item.url, item.key, isVideo, active, onScaleChange]);

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
      <div className="w-full h-full flex flex-col items-center justify-center bg-white min-h-0">
        <div className="flex-1 w-full flex items-center justify-center min-h-0 px-1">
          <video
            ref={active ? videoRef : undefined}
            src={item.url}
            playsInline
            preload="metadata"
            muted={false}
            className="max-h-full max-w-full w-auto h-auto object-contain"
            onContextMenu={blockSave}
          />
        </div>
        {active && videoRef && <PhotoViewerVideoBar videoRef={videoRef} active={active} />}
      </div>
    );
  }

  const title = mediaDisplayTitle(item.title, item.filename);

  return (
    <div
      {...(active ? bindPinch() : {})}
      className="w-full h-full flex items-center justify-center bg-white touch-none select-none"
      onDoubleClick={onDoubleClick}
      onTouchEnd={onTouchEndZoom}
      onContextMenu={blockSave}
    >
      {status === 'loading' && active && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
          <Loader2 className="w-8 h-8 animate-spin text-[#8E8E93]" />
        </div>
      )}
      {status === 'error' && active && (
        <p className="text-sm text-red-500 pointer-events-none">加载失败</p>
      )}
      {displayUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={displayUrl}
          alt={title}
          draggable={false}
          className={cn(
            'max-h-full max-w-full object-contain no-save will-change-transform',
            status === 'ready' ? 'opacity-100' : 'opacity-0'
          )}
          style={{
            transform: active ? `scale(${imageScale})` : undefined,
            transition: imageScale === 1 ? 'transform 0.25s ease-out' : 'none',
          }}
          onLoad={() => setStatus('ready')}
          onError={() => setStatus('error')}
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
};

export function PhotoViewerCarousel({
  items,
  index,
  onChange,
  imageScale,
  onScaleChange,
  swipeEnabled,
}: CarouselProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [vw, setVw] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchRef = useRef({ x0: 0, y0: 0, axis: null as 'x' | 'y' | null });

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setVw(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setDragX(0);
    onScaleChange(1);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [index, onScaleChange]);

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
    if (!swipeEnabled || imageScale !== 1) return;
    const t = e.touches[0];
    if (!t) return;
    touchRef.current = { x0: t.clientX, y0: t.clientY, axis: null };
    setIsDragging(true);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!swipeEnabled || imageScale !== 1) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - touchRef.current.x0;
    const dy = t.clientY - touchRef.current.y0;
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
      className="flex-1 min-h-0 overflow-hidden bg-white touch-pan-y"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {vw > 0 && (
        <div
          className="flex h-full"
          style={{
            width: trackWidth,
            transform: `translateX(${-baseOffset + dragX}px)`,
            transition: isDragging ? 'none' : 'transform 0.28s ease-out',
          }}
        >
          {indices.map((i) => (
            <div key={items[i]!.id} className="h-full shrink-0" style={{ width: vw }}>
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
