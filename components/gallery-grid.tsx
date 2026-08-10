'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/gallery-format';
import { isCompactGrid, showTinyDuration } from '@/lib/gallery-density';
import type { GalleryItem } from '@/components/gallery-types';

function GridCell({
  item,
  columns,
  selectMode,
  selected,
  onToggleSelect,
  onOpen,
}: {
  item: GalleryItem;
  columns: number;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
}) {
  const isVideo = item.kind === 'video' || item.mimeType.startsWith('video/');
  const compact = isCompactGrid(columns);
  const tinyDuration = showTinyDuration(columns);
  /** 网格内一律用缩略图 URL，减轻流量 */
  const src = item.thumbUrl || item.url;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [frameReady, setFrameReady] = useState(!isVideo || compact);

  useEffect(() => {
    if (!isVideo || compact) return;
    setFrameReady(false);
  }, [item.id, isVideo, compact]);

  function handleClick() {
    if (selectMode) onToggleSelect();
    else onOpen();
  }

  return (
    <button
      type="button"
      className={cn(
        'photos-cell relative aspect-square overflow-hidden bg-[#E5E5EA] no-save',
        selected && selectMode && 'ring-2 ring-[#007AFF] ring-inset z-[1]'
      )}
      onClick={handleClick}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={item.filename}
      aria-pressed={selectMode ? selected : undefined}
    >
      {isVideo && !compact ? (
        <>
          <video
            ref={videoRef}
            src={item.url}
            className={cn(
              'absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-200',
              frameReady ? 'opacity-100' : 'opacity-0'
            )}
            muted
            playsInline
            preload="metadata"
            controls={false}
            onLoadedMetadata={() => {
              const v = videoRef.current;
              if (!v) return;
              try {
                if (v.currentTime < 0.05) v.currentTime = 0.1;
              } catch {
                /* ignore */
              }
            }}
            onSeeked={() => setFrameReady(true)}
            onLoadedData={() => setFrameReady(true)}
          />
          {!frameReady && <div className="absolute inset-0 bg-[#E5E5EA] animate-pulse" />}
        </>
      ) : isVideo && compact ? (
        <div className="absolute inset-0 bg-[#D1D1D6] flex items-center justify-center">
          <Play className="w-[40%] h-[40%] text-white/90 drop-shadow" fill="currentColor" strokeWidth={0} />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
      )}

      {isVideo && !compact && item.duration != null && (
        <span
          className={cn('photos-duration', tinyDuration && 'photos-duration-tiny')}
        >
          {formatDuration(item.duration)}
        </span>
      )}

      {selectMode && (
        <span
          className={cn(
            'absolute top-1 right-1 rounded-full border-2 flex items-center justify-center transition-colors',
            columns >= 7 ? 'w-4 h-4' : 'w-[22px] h-[22px]',
            selected
              ? 'bg-[#007AFF] border-[#007AFF] text-white'
              : 'bg-black/25 border-white/90'
          )}
        >
          {selected && (
            <Check className={cn(columns >= 7 ? 'w-2.5 h-2.5' : 'w-3 h-3')} strokeWidth={3} />
          )}
        </span>
      )}
    </button>
  );
}

export type DaySection = {
  key: string;
  label: string;
  items: GalleryItem[];
};

type Props = {
  sections: DaySection[];
  columns: number;
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onOpen: (item: GalleryItem) => void;
  onSectionVisible?: (sectionKey: string) => void;
  showInlineHeaders?: boolean;
  /** 捏合过程中显示分组浮层标题 */
  showOverlayHeaders?: boolean;
};

export function GalleryGrid({
  sections,
  columns,
  selectMode,
  selectedIds,
  onToggleSelect,
  onOpen,
  onSectionVisible,
  showInlineHeaders = false,
  showOverlayHeaders = false,
}: Props) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const gridStyle = {
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
  };

  useEffect(() => {
    observerRef.current?.disconnect();
    if (!onSectionVisible) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const first = visible[0];
        if (first?.target instanceof HTMLElement) {
          const key = first.target.dataset.sectionKey;
          if (key) onSectionVisible(key);
        }
      },
      { rootMargin: '-80px 0px -55% 0px', threshold: 0 }
    );

    document.querySelectorAll('[data-section-key]').forEach((el) => {
      observerRef.current?.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, [sections, onSectionVisible]);

  if (sections.length === 0) {
    return (
      <div className="py-24 text-center text-[15px] text-[var(--photos-muted)]">暂无照片</div>
    );
  }

  return (
    <div className="photos-grid-wrap">
      {sections.map((section) => (
        <section key={section.key} data-section-key={section.key} className="photos-section relative">
          {showInlineHeaders && (
            <h2
              className={cn(
                'photos-section-title px-4 pt-4 pb-2 font-bold tracking-tight',
                columns >= 7 ? 'text-[15px]' : 'text-[22px]'
              )}
            >
              {section.label}
            </h2>
          )}
          {showOverlayHeaders && !showInlineHeaders && (
            <div
              className="photos-section-overlay"
              aria-hidden
            >
              {section.label}
            </div>
          )}
          <div className="photos-grid" style={gridStyle}>
            {section.items.map((item) => (
              <GridCell
                key={item.id}
                item={item}
                columns={columns}
                selectMode={selectMode}
                selected={selectedIds.has(item.id)}
                onToggleSelect={() => onToggleSelect(item.id)}
                onOpen={() => onOpen(item)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
