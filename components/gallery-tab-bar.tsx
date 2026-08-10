'use client';

import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GalleryViewMode } from '@/components/gallery-types';

type Props = {
  mode: GalleryViewMode;
  onModeChange: (mode: GalleryViewMode) => void;
  onSearchClick: () => void;
  searchActive?: boolean;
};

const TABS: { id: GalleryViewMode | 'search'; label: string }[] = [
  { id: 'library', label: '图库' },
  { id: 'year', label: '年' },
  { id: 'month', label: '月' },
  { id: 'all', label: '全部' },
];

export function GalleryTabBar({ mode, onModeChange, onSearchClick, searchActive }: Props) {
  return (
    <nav
      className="photos-tab-bar fixed left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5 px-1.5 py-1.5 rounded-full"
      style={{ bottom: 'max(12px, env(safe-area-inset-bottom))' }}
      aria-label="图库导航"
    >
      {TABS.map((tab) => {
        const active = tab.id === mode;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onModeChange(tab.id as GalleryViewMode)}
            className={cn(
              'photos-tab-item min-h-[36px] px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors',
              active ? 'photos-tab-item-active' : 'text-[var(--photos-muted)]'
            )}
          >
            {tab.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={onSearchClick}
        className={cn(
          'photos-tab-item min-w-[36px] min-h-[36px] rounded-full flex items-center justify-center transition-colors',
          searchActive ? 'photos-tab-item-active' : 'text-[var(--photos-muted)]'
        )}
        aria-label="搜索"
      >
        <Search className="w-[18px] h-[18px]" strokeWidth={2.25} />
      </button>
    </nav>
  );
}
