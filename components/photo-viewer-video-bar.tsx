'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { formatDuration } from '@/lib/gallery-format';
import { cn } from '@/lib/utils';

type Props = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  active: boolean;
  onPlayingChange?: (playing: boolean) => void;
};

function safeDuration(raw: number): number {
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

export function PhotoViewerVideoBar({ videoRef, active, onPlayingChange }: Props) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [canSeek, setCanSeek] = useState(false);
  const seekingRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      setPlaying(false);
      setCurrent(0);
      setDuration(0);
      setCanSeek(false);
      seekingRef.current = false;
      pendingSeekRef.current = null;
      onPlayingChange?.(false);
    }
  }, [active, onPlayingChange]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !active) return;

    const syncMeta = () => {
      const d = safeDuration(v.duration);
      setDuration(d);
      setCanSeek(d > 0 && v.readyState >= 1);
      setMuted(v.muted);
      if (!seekingRef.current) setCurrent(v.currentTime || 0);
    };

    const onTime = () => {
      if (seekingRef.current) return;
      setCurrent(v.currentTime || 0);
    };
    const onPlay = () => {
      setPlaying(true);
      onPlayingChange?.(true);
    };
    const onPause = () => {
      setPlaying(false);
      onPlayingChange?.(false);
    };
    const onSeeking = () => {
      seekingRef.current = true;
    };
    const onSeeked = () => {
      if (pendingSeekRef.current == null) seekingRef.current = false;
      setCurrent(v.currentTime || 0);
    };

    v.addEventListener('timeupdate', onTime);
    v.addEventListener('loadedmetadata', syncMeta);
    v.addEventListener('durationchange', syncMeta);
    v.addEventListener('loadeddata', syncMeta);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('seeking', onSeeking);
    v.addEventListener('seeked', onSeeked);
    syncMeta();
    setPlaying(!v.paused);
    onPlayingChange?.(!v.paused);

    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('loadedmetadata', syncMeta);
      v.removeEventListener('durationchange', syncMeta);
      v.removeEventListener('loadeddata', syncMeta);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('seeking', onSeeking);
      v.removeEventListener('seeked', onSeeked);
    };
  }, [videoRef, active, onPlayingChange]);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play().catch(() => undefined);
    } else {
      v.pause();
    }
  }

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }

  function beginSeek() {
    seekingRef.current = true;
  }

  function scrubTo(v: number) {
    if (!canSeek || !Number.isFinite(v)) return;
    pendingSeekRef.current = v;
    setCurrent(v);
  }

  function endSeek() {
    const el = videoRef.current;
    const pending = pendingSeekRef.current;
    pendingSeekRef.current = null;
    if (el && pending != null && Number.isFinite(pending)) {
      try {
        el.currentTime = pending;
      } catch {
        /* iOS may throw before metadata */
      }
      setCurrent(pending);
    }
    seekingRef.current = false;
  }

  return (
    <div
      className="photos-video-bar shrink-0 mx-3 mb-2 px-3 py-2.5 flex items-center gap-2.5"
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="photos-video-bar-btn shrink-0"
        onClick={togglePlay}
        aria-label={playing ? '暂停' : '播放'}
      >
        {playing ? (
          <Pause className="w-5 h-5" fill="currentColor" />
        ) : (
          <Play className="w-5 h-5" fill="currentColor" />
        )}
      </button>

      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-[11px] tabular-nums text-[var(--photos-muted)] w-9 text-right shrink-0">
          {formatDuration(current) || '0:00'}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.05}
          value={Math.min(current, duration || 0)}
          disabled={!canSeek}
          onChange={(e) => scrubTo(Number(e.target.value))}
          onPointerDown={beginSeek}
          onPointerUp={endSeek}
          onPointerCancel={endSeek}
          onTouchStart={beginSeek}
          onTouchEnd={endSeek}
          onMouseDown={beginSeek}
          onMouseUp={endSeek}
          className={cn('photos-video-seek flex-1 min-w-0', !canSeek && 'opacity-40')}
          aria-label="播放进度"
        />
        <span className="text-[11px] tabular-nums text-[var(--photos-muted)] w-9 shrink-0">
          {formatDuration(duration) || '0:00'}
        </span>
      </div>

      <button
        type="button"
        className={cn('photos-video-bar-btn shrink-0', muted && 'opacity-60')}
        onClick={toggleMute}
        aria-label={muted ? '取消静音' : '静音'}
      >
        {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
      </button>
    </div>
  );
}
