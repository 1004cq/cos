'use client';

import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/gallery-format';
import { isCompactGrid, showTinyDuration } from '@/lib/gallery-density';
import type { GalleryItem } from '@/components/gallery-types';
import { MediaCover } from '@/components/media-cover';

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

  function handleClick() {
    if (selectMode) onToggleSelect();
    else onOpen();
  }

  return (
    <button
      type="button"
      className={cn(
        'photos-cell relative aspect-square overflow-hidden bg-zinc-800 no-save',
        selected && selectMode && 'ring-2 ring-[#007AFF] ring-inset z-[1]'
      )}
      onClick={handleClick}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={item.filename}
      aria-pressed={selectMode ? selected : undefined}
    >
      <MediaCover
        id={item.id}
        posterUrl={item.posterUrl}
        thumbUrl={item.thumbUrl}
        isVideo={isVideo}
        showPlayBadge={isVideo}
        className="absolute inset-0"
      />

      {isVideo && item.duration != null && (
        <span className={cn('photos-duration', (tinyDuration || compact) && 'photos-duration-tiny')}>
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
            <div className="photos-section-overlay" aria-hidden>
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
