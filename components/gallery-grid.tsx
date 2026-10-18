'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
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
        'photos-cell relative aspect-square overflow-hidden bg-[#E5E5EA] no-save',
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
        thumbUrl={isVideo ? null : item.thumbUrl || null}
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

type VirtualRow =
  | { type: 'header'; sectionKey: string; label: string }
  | { type: 'cells'; sectionKey: string; items: GalleryItem[] };

function buildVirtualRows(
  sections: DaySection[],
  columns: number,
  showInlineHeaders: boolean
): VirtualRow[] {
  const rows: VirtualRow[] = [];
  const cols = Math.max(1, columns);
  for (const section of sections) {
    if (showInlineHeaders) {
      rows.push({ type: 'header', sectionKey: section.key, label: section.label });
    }
    for (let i = 0; i < section.items.length; i += cols) {
      rows.push({
        type: 'cells',
        sectionKey: section.key,
        items: section.items.slice(i, i + cols),
      });
    }
  }
  return rows;
}

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
  const parentRef = useRef<HTMLDivElement | null>(null);
  const cols = Math.max(1, columns);

  const rows = useMemo(
    () => buildVirtualRows(sections, cols, showInlineHeaders),
    [sections, cols, showInlineHeaders]
  );

  const estimateSize = (index: number) => {
    const row = rows[index];
    if (!row) return 120;
    if (row.type === 'header') return cols >= 7 ? 40 : 52;
    // 正方形格子：按视口宽度估算
    const width =
      typeof window !== 'undefined' ? Math.min(window.innerWidth, 900) : 390;
    const gap = 2;
    const cell = (width - gap * (cols - 1)) / cols;
    return Math.max(48, cell);
  };

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize,
    overscan: 8,
    scrollMargin: parentRef.current?.offsetTop ?? 0,
  });

  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    if (!onSectionVisible || virtualItems.length === 0) return;
    const first = virtualItems[0];
    const row = first ? rows[first.index] : null;
    if (row?.sectionKey) onSectionVisible(row.sectionKey);
  }, [virtualItems, rows, onSectionVisible]);

  if (sections.length === 0) {
    return (
      <div className="py-24 text-center text-[15px] text-[var(--photos-muted)]">暂无照片</div>
    );
  }

  const gridStyle = {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  };

  return (
    <div ref={parentRef} className="photos-grid-wrap">
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((vRow) => {
          const row = rows[vRow.index];
          if (!row) return null;
          return (
            <div
              key={vRow.key}
              data-index={vRow.index}
              data-section-key={row.sectionKey}
              ref={virtualizer.measureElement}
              className={cn(
                'photos-section absolute left-0 w-full',
                row.type === 'header' && 'relative'
              )}
              style={{
                transform: `translateY(${vRow.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              {row.type === 'header' ? (
                <h2
                  className={cn(
                    'photos-section-title px-4 pt-4 pb-2 font-bold tracking-tight',
                    cols >= 7 ? 'text-[15px]' : 'text-[22px]'
                  )}
                >
                  {row.label}
                </h2>
              ) : (
                <div className="relative">
                  {showOverlayHeaders && !showInlineHeaders && (
                    <div className="photos-section-overlay" aria-hidden>
                      {sections.find((s) => s.key === row.sectionKey)?.label}
                    </div>
                  )}
                  <div className="photos-grid" style={gridStyle}>
                    {row.items.map((item) => (
                      <GridCell
                        key={item.id}
                        item={item}
                        columns={cols}
                        selectMode={selectMode}
                        selected={selectedIds.has(item.id)}
                        onToggleSelect={() => onToggleSelect(item.id)}
                        onOpen={() => onOpen(item)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
