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

function unloadVideo(v: HTMLVideoElement | null | undefined) {
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
}

type SlideProps = {
  item: LightboxItem;
  active: boolean;
  imageScale: number;
  onScaleChange: (scale: number) => void;
  pan: { x: number; y: number };
  onPanChange: (pan: { x: number; y: number }) => void;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
};

function ViewerSlide({
  item,
  active,
  imageScale,
  onScaleChange,
  pan,
  onPanChange,
  videoRef,
}: SlideProps) {
  const isVideo = item.mimeType.startsWith('video/');
  const thumbUrl = item.posterUrl || item.thumbUrl || null;
  const fullUrl = item.url || '';
  const [displayUrl, setDisplayUrl] = useState(thumbUrl || fullUrl);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(() =>
    thumbUrl ? 'ready' : fullUrl ? 'loading' : 'error'
  );
  const [showSpinner, setShowSpinner] = useState(!thumbUrl && Boolean(fullUrl));
  const [posterFailed, setPosterFailed] = useState(false);
  const [needBigPlay, setNeedBigPlay] = useState(false);
  const lastTapRef = useRef(0);
  const pinchStartScale = useRef(1);

  useEffect(() => {
    if (!active || isVideo) return;
    onScaleChange(1);
    onPanChange({ x: 0, y: 0 });

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
  }, [item.id, item.url, item.thumbUrl, isVideo, active, onScaleChange, onPanChange]);

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
        const snapped = next < 1.15 ? 1 : next;
        onScaleChange(snapped);
        if (snapped === 1) onPanChange({ x: 0, y: 0 });
      }
    },
    { pointer: { touch: true }, scaleBounds: { min: 0.5, max: 3.5 }, rubberband: 0.1 }
  );

  function onDoubleClick(e: React.MouseEvent) {
    if (isVideo) return;
    e.stopPropagation();
    if (imageScale > 1) {
      onScaleChange(1);
      onPanChange({ x: 0, y: 0 });
    } else {
      onScaleChange(2);
    }
  }

  function onTouchEndZoom(e: React.TouchEvent) {
    if (isVideo) return;
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      e.preventDefault();
      if (imageScale > 1) {
        onScaleChange(1);
        onPanChange({ x: 0, y: 0 });
      } else {
        onScaleChange(2);
      }
    }
    lastTapRef.current = now;
  }

  /** 进入/切到视频：默认有声尝试 play；策略拒绝则大播放钮，点击后再有声 play。不强制 muted=true */
  useEffect(() => {
    if (!isVideo || !active) {
      setNeedBigPlay(false);
      return;
    }

    const v = videoRef?.current;
    if (!v) return;

    let cancelled = false;
    v.muted = false;
    v.defaultMuted = false;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.removeAttribute('muted');

    const onPlaying = () => {
      if (!cancelled) setNeedBigPlay(false);
    };

    let onReady: (() => void) | null = null;

    const tryPlay = async () => {
      if (cancelled) return;
      v.muted = false;
      v.defaultMuted = false;
      try {
        await v.play();
        if (cancelled) return;
        setNeedBigPlay(false);
      } catch {
        if (cancelled) return;
        setNeedBigPlay(true);
      }
    };

    if (v.readyState >= 2) {
      void tryPlay();
    } else {
      onReady = () => {
        if (onReady) v.removeEventListener('loadeddata', onReady);
        void tryPlay();
      };
      v.addEventListener('loadeddata', onReady);
    }

    v.addEventListener('playing', onPlaying);

    return () => {
      cancelled = true;
      if (onReady) v.removeEventListener('loadeddata', onReady);
      v.removeEventListener('playing', onPlaying);
      unloadVideo(v);
    };
  }, [isVideo, active, item.id, fullUrl, videoRef]);

  if (isVideo) {
    return (
      <div className="photos-viewer-slide relative w-full h-full bg-black">
        {active ? (
          <>
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
            {needBigPlay && (
              <button
                type="button"
                className="absolute inset-0 z-[2] flex items-center justify-center bg-black/25"
                aria-label="播放"
                onClick={(e) => {
                  e.stopPropagation();
                  const el = videoRef?.current;
                  if (!el) return;
                  el.muted = false;
                  el.defaultMuted = false;
                  el.removeAttribute('muted');
                  void el.play().then(
                    () => setNeedBigPlay(false),
                    () => setNeedBigPlay(true)
                  );
                }}
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-black shadow-lg">
                  <svg viewBox="0 0 24 24" className="ml-1 h-8 w-8 fill-current" aria-hidden>
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </button>
            )}
          </>
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
            transform: active
              ? `translate(${pan.x}px, ${pan.y}px) scale(${imageScale})`
              : undefined,
            transition: imageScale === 1 && pan.x === 0 && pan.y === 0
              ? 'transform 0.25s ease-out'
              : 'none',
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
  const [suppressTransition, setSuppressTransition] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragXRef = useRef(0);
  const panRef = useRef({ x: 0, y: 0 });
  const animLockRef = useRef(false);

  const setPanBoth = useCallback((next: { x: number; y: number }) => {
    panRef.current = next;
    setPan(next);
  }, []);

  const touchRef = useRef({
    x0: 0,
    y0: 0,
    panX0: 0,
    panY0: 0,
    axis: null as 'x' | 'y' | null,
    moved: false,
    mode: null as 'swipe' | 'pan' | null,
  });

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setVw(el.clientWidth || window.innerWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** index 变化：重置位移/缩放，避免 residual transform 回弹 */
  useEffect(() => {
    animLockRef.current = false;
    dragXRef.current = 0;
    panRef.current = { x: 0, y: 0 };
    setSuppressTransition(true);
    setDragX(0);
    setPanBoth({ x: 0, y: 0 });
    onScaleChange(1);
    const id = window.requestAnimationFrame(() => setSuppressTransition(false));
    return () => window.cancelAnimationFrame(id);
  }, [index, onScaleChange, setPanBoth]);

  /** 关闭灯箱 / 卸载时停播并卸 src */
  useEffect(() => {
    return () => {
      unloadVideo(videoRef.current);
    };
  }, [videoRef]);

  const commit = useCallback(
    (nextIndex: number, animateTo: number) => {
      if (animLockRef.current) return;
      if (nextIndex === index) {
        dragXRef.current = 0;
        setDragX(0);
        return;
      }
      animLockRef.current = true;
      dragXRef.current = animateTo;
      setDragX(animateTo);
      window.setTimeout(() => {
        setSuppressTransition(true);
        onChange(nextIndex);
        dragXRef.current = 0;
        setDragX(0);
        // transition 抑制在 index effect 里再打开
      }, 280);
    },
    [index, onChange]
  );

  function onTouchStart(e: React.TouchEvent) {
    if (animLockRef.current) return;
    const t = e.touches[0];
    if (!t) return;
    touchRef.current = {
      x0: t.clientX,
      y0: t.clientY,
      panX0: panRef.current.x,
      panY0: panRef.current.y,
      axis: null,
      moved: false,
      mode: null,
    };
    if (imageScale > 1) {
      touchRef.current.mode = 'pan';
      setIsDragging(true);
      return;
    }
    if (!swipeEnabled || imageScale !== 1) return;
    touchRef.current.mode = 'swipe';
    setIsDragging(true);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (animLockRef.current) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - touchRef.current.x0;
    const dy = t.clientY - touchRef.current.y0;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) touchRef.current.moved = true;

    // 放大：只平移，不切页
    if (touchRef.current.mode === 'pan' || imageScale > 1) {
      const next = {
        x: touchRef.current.panX0 + dx,
        y: touchRef.current.panY0 + dy,
      };
      panRef.current = next;
      setPanBoth(next);
      return;
    }

    if (!swipeEnabled || imageScale !== 1 || touchRef.current.mode !== 'swipe') return;

    if (!touchRef.current.axis) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) touchRef.current.axis = 'x';
      else if (Math.abs(dy) > 10) touchRef.current.axis = 'y';
    }
    if (touchRef.current.axis !== 'x') return;

    let offset = dx;
    if (index === 0 && offset > 0) offset *= 0.32;
    if (index === items.length - 1 && offset < 0) offset *= 0.32;
    dragXRef.current = offset;
    setDragX(offset);
  }

  function onTouchEnd() {
    setIsDragging(false);

    const wasTap = !touchRef.current.moved && touchRef.current.axis == null;
    if (wasTap && touchRef.current.mode !== 'pan') {
      onMediaTap?.();
      touchRef.current.axis = null;
      touchRef.current.mode = null;
      return;
    }

    // 放大平移结束：不切页
    if (touchRef.current.mode === 'pan' || imageScale > 1) {
      touchRef.current.axis = null;
      touchRef.current.mode = null;
      return;
    }

    if (
      animLockRef.current ||
      !swipeEnabled ||
      imageScale !== 1 ||
      touchRef.current.axis !== 'x'
    ) {
      if (dragXRef.current !== 0) {
        dragXRef.current = 0;
        setDragX(0);
      }
      touchRef.current.axis = null;
      touchRef.current.mode = null;
      return;
    }

    const dx = dragXRef.current;
    const threshold = Math.max(56, vw * 0.18);
    // 未达阈值：回弹当前页，绝不先改 index
    if (dx < -threshold && index < items.length - 1) {
      commit(index + 1, -vw);
    } else if (dx > threshold && index > 0) {
      commit(index - 1, vw);
    } else {
      dragXRef.current = 0;
      setDragX(0);
    }
    touchRef.current.axis = null;
    touchRef.current.mode = null;
  }

  const indices = [index - 1, index, index + 1].filter((i) => i >= 0 && i < items.length);
  const trackWidth = vw * indices.length;
  const baseOffset = indices.indexOf(index) * vw;
  // 拖拽中 / 切页瞬间对齐：无 transition，避免「滑过去又弹回」
  const useTransition =
    isDragging || suppressTransition ? 'none' : 'transform 0.28s ease-out';

  return (
    <div
      ref={viewportRef}
      className="photos-viewer-carousel absolute inset-0 w-full h-full overflow-hidden bg-black touch-pan-y"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
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
            transition: useTransition,
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
                pan={i === index ? pan : { x: 0, y: 0 }}
                onPanChange={setPanBoth}
                videoRef={i === index ? videoRef : undefined}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
