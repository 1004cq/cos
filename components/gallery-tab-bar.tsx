'use client';

import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GalleryDensity } from '@/lib/gallery-density';

type Props = {
  density: GalleryDensity;
  onDensityChange: (density: GalleryDensity) => void;
  onSearchClick: () => void;
  searchActive?: boolean;
};

const TABS: { id: GalleryDensity | 'search'; label: string }[] = [
  { id: 'year', label: '年' },
  { id: 'month', label: '月' },
  { id: 'all', label: '全部' },
];

export function GalleryTabBar({ density, onDensityChange, onSearchClick, searchActive }: Props) {
  return (
    <nav
      className="photos-tab-bar fixed left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5 px-1.5 py-1.5 rounded-full"
      style={{ bottom: 'max(12px, env(safe-area-inset-bottom))' }}
      aria-label="图库密度"
    >
      {TABS.map((tab) => {
        const active = tab.id === density;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onDensityChange(tab.id as GalleryDensity)}
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
