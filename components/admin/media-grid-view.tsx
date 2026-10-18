'use client';

import { cn, mediaDisplayTitle } from '@/lib/utils';
import type { MediaItem } from '@/components/admin/media-types';

type Props = {
  items: MediaItem[];
  thumbs: Record<string, string>;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onPreview: (id: string) => void;
};

export function MediaGridView({
  items,
  thumbs,
  selected,
  onToggleSelect,
  onPreview,
}: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {items.map((item) => {
        const isVideo = item.mimeType.startsWith('video/');
        const checked = selected.has(item.id);
        return (
          <div
            key={item.id}
            className={cn('media-tile relative', checked && 'ring-2 ring-blue-500')}
          >
            <input
              type="checkbox"
              className="absolute top-2 left-2 z-20 w-4 h-4 cursor-pointer"
              checked={checked}
              aria-label={`选择 ${item.filename}`}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                e.stopPropagation();
                onToggleSelect(item.id);
              }}
            />
            <button
              type="button"
              className="absolute inset-0 z-10 w-full h-full text-left"
              onClick={() => onPreview(item.id)}
              aria-label={`预览 ${mediaDisplayTitle(item.title, item.filename)}`}
            >
              {isVideo ? (
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{ color: 'var(--text-muted)' }}
                >
                  ▶
                </div>
              ) : thumbs[item.id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbs[item.id]} alt={item.filename} loading="lazy" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-xs"
                  style={{ color: 'var(--text-muted)' }}
                >
                  …
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/40 to-transparent pointer-events-none">
                <p className="text-white text-xs truncate">
                  {mediaDisplayTitle(item.title, item.filename)}
                </p>
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}
