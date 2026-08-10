'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { formatDuration } from '@/lib/gallery-format';
import { cn } from '@/lib/utils';

type Props = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  active: boolean;
};

export function PhotoViewerVideoBar({ videoRef, active }: Props) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const seekingRef = useRef(false);

  useEffect(() => {
    if (!active) {
      setPlaying(false);
      setCurrent(0);
    }
  }, [active]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !active) return;

    const onTime = () => {
      if (!seekingRef.current) setCurrent(v.currentTime);
    };
    const onMeta = () => setDuration(v.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    v.addEventListener('timeupdate', onTime);
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('durationchange', onMeta);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    if (v.readyState >= 1) onMeta();

    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('durationchange', onMeta);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
    };
  }, [videoRef, active]);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  }

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }

  function onSeek(v: number) {
    const el = videoRef.current;
    if (!el || !Number.isFinite(v)) return;
    el.currentTime = v;
    setCurrent(v);
  }

  return (
    <div className="photos-video-bar shrink-0 mx-3 mb-2 px-3 py-2.5 flex items-center gap-2.5">
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
          {formatDuration(current)}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.05}
          value={current}
          onChange={(e) => onSeek(Number(e.target.value))}
          onPointerDown={() => {
            seekingRef.current = true;
          }}
          onPointerUp={() => {
            seekingRef.current = false;
          }}
          className="photos-video-seek flex-1 min-w-0"
          aria-label="播放进度"
        />
        <span className="text-[11px] tabular-nums text-[var(--photos-muted)] w-9 shrink-0">
          {formatDuration(duration)}
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
