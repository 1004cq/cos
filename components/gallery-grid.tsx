'use client';

import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/gallery-format';
import type { GalleryItem } from '@/components/gallery-types';

function GridCell({
  item,
  selectMode,
  selected,
  onToggleSelect,
  onOpen,
}: {
  item: GalleryItem;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
}) {
  const isVideo = item.kind === 'video' || item.mimeType.startsWith('video/');
  const src = isVideo ? item.url : item.thumbUrl || item.url;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [frameReady, setFrameReady] = useState(!isVideo);

  useEffect(() => {
    if (!isVideo) return;
    setFrameReady(false);
  }, [item.id, isVideo]);

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
      {isVideo ? (
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

      {isVideo && item.duration != null && (
        <span className="photos-duration">{formatDuration(item.duration)}</span>
      )}

      {selectMode && (
        <span
          className={cn(
            'absolute top-1.5 right-1.5 w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center transition-colors',
            selected
              ? 'bg-[#007AFF] border-[#007AFF] text-white'
              : 'bg-black/25 border-white/90'
          )}
        >
          {selected && <Check className="w-3 h-3" strokeWidth={3} />}
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
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onOpen: (item: GalleryItem) => void;
  onSectionVisible?: (sectionKey: string) => void;
  showInlineHeaders?: boolean;
};

export function GalleryGrid({
  sections,
  selectMode,
  selectedIds,
  onToggleSelect,
  onOpen,
  onSectionVisible,
  showInlineHeaders = true,
}: Props) {
  const observerRef = useRef<IntersectionObserver | null>(null);

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
        <section key={section.key} data-section-key={section.key} className="photos-section">
          {showInlineHeaders && (
            <h2 className="photos-section-title px-4 pt-5 pb-2 text-[22px] font-bold tracking-tight">
              {section.label}
            </h2>
          )}
          <div className="photos-grid">
            {section.items.map((item) => (
              <GridCell
                key={item.id}
                item={item}
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
