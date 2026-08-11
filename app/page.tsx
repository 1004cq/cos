'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Search, X } from 'lucide-react';
import { Lightbox } from '@/components/lightbox';
import { GalleryGrid, type DaySection } from '@/components/gallery-grid';
import { GalleryPinchGrid } from '@/components/gallery-pinch-grid';
import { GalleryTabBar } from '@/components/gallery-tab-bar';
import type { GalleryItem } from '@/components/gallery-types';
import {
  type GalleryDensity,
  DENSITY_PRESETS,
} from '@/lib/gallery-density';
import {
  dayKey,
  formatGalleryDay,
  formatGalleryMonth,
  formatGalleryYear,
  itemSortDate,
  monthKey,
  yearKey,
} from '@/lib/gallery-format';
import { cn } from '@/lib/utils';

function buildSections(items: GalleryItem[], groupBy: 'day' | 'month' | 'year'): DaySection[] {
  const sorted = [...items].sort(
    (a, b) => itemSortDate(b).getTime() - itemSortDate(a).getTime()
  );

  if (groupBy === 'year') {
    const map = new Map<string, GalleryItem[]>();
    for (const item of sorted) {
      const k = yearKey(itemSortDate(item));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(item);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([key, list]) => ({
        key,
        label: formatGalleryYear(itemSortDate(list[0]!)),
        items: list,
      }));
  }

  if (groupBy === 'month') {
    const map = new Map<string, GalleryItem[]>();
    for (const item of sorted) {
      const k = monthKey(itemSortDate(item));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(item);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, list]) => ({
        key,
        label: formatGalleryMonth(itemSortDate(list[0]!)),
        items: list,
      }));
  }

  const map = new Map<string, GalleryItem[]>();
  for (const item of sorted) {
    const d = itemSortDate(item);
    const k = dayKey(d);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, list]) => ({
      key,
      label: formatGalleryDay(itemSortDate(list[0]!)),
      items: list,
    }));
}

export default function HomePage() {
  const { status } = useSession();
  const isAdmin = status === 'authenticated';

  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [density, setDensity] = useState<GalleryDensity>('all');
  const [headerDateKey, setHeaderDateKey] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleting, setDeleting] = useState(false);

  const preset = DENSITY_PRESETS[density];

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/gallery?pageSize=100');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '加载失败');
        const images: GalleryItem[] = data.images || [];
        const videos: GalleryItem[] = data.videos || [];
        const merged = [...images, ...videos].sort(
          (a, b) => itemSortDate(b).getTime() - itemSortDate(a).getTime()
        );
        setItems(merged);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const name = (item.filename || '').toLowerCase();
      const title = (item.title || '').toLowerCase();
      return name.includes(q) || title.includes(q);
    });
  }, [items, searchQuery]);

  const sections = useMemo(
    () => buildSections(filteredItems, preset.groupBy),
    [filteredItems, preset.groupBy]
  );

  const flatItems = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  const headerLabel = useMemo(() => {
    if (density !== 'all') {
      return filteredItems.length ? `共 ${filteredItems.length} 项` : '';
    }
    if (headerDateKey) {
      const sec = sections.find((s) => s.key === headerDateKey);
      if (sec) return sec.label;
    }
    return sections[0]?.label ?? '';
  }, [headerDateKey, sections, density, filteredItems.length]);

  useEffect(() => {
    if (sections[0]?.key) setHeaderDateKey(sections[0].key);
  }, [sections]);

  const onSectionVisible = useCallback((key: string) => {
    setHeaderDateKey(key);
  }, []);

  function openItem(item: GalleryItem) {
    const idx = flatItems.findIndex((x) => x.id === item.id);
    if (idx >= 0) setLightboxIndex(idx);
  }

  async function handleDeleteOne(id: string) {
    if (!isAdmin || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/media/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', ids: [id], deleteFromCos: false }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '删除失败');
      }
      setItems((prev) => prev.filter((i) => i.id !== id));
      setLightboxIndex(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  }

  const skeletonCols = preset.columns;

  return (
    <div className="photos-app min-h-[100dvh] flex flex-col bg-[#FFFFFF]">
      <header
        className="sticky top-0 z-20 bg-[#FFFFFF]/92 backdrop-blur-xl border-b border-black/[0.06]"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex items-start justify-between gap-2 px-4 pt-2 pb-2 min-h-[52px]">
          <div className="min-w-0 flex-1">
            <h1 className="text-[34px] font-bold leading-tight tracking-tight text-black">
              图库
            </h1>
            {!loading && headerLabel && (
              <p className="text-[15px] font-semibold text-black/80 mt-0.5">{headerLabel}</p>
            )}
          </div>
        </div>

        {searchOpen && (
          <div className="px-4 pb-3 flex gap-2 items-center">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--photos-muted)]" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索文件名或标题"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#F2F2F7] text-[15px] outline-none"
                autoFocus
              />
            </div>
            <button
              type="button"
              className="photos-icon-btn shrink-0"
              onClick={() => {
                setSearchOpen(false);
                setSearchQuery('');
              }}
              aria-label="关闭搜索"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
      </header>

      {error && <p className="text-center px-4 py-3 text-sm text-red-500">{error}</p>}

      <main className="flex-1 pb-[calc(72px+env(safe-area-inset-bottom))] touch-pan-y">
        {loading ? (
          <div
            className="photos-grid"
            style={{ gridTemplateColumns: `repeat(${skeletonCols}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: skeletonCols * 4 }).map((_, i) => (
              <div key={i} className="aspect-square bg-[#E5E5EA] animate-pulse" />
            ))}
          </div>
        ) : (
          <GalleryPinchGrid density={density} onDensityChange={setDensity}>
            {({ columns, pinching, bind }) => (
              <div
                {...bind()}
                className={cn(
                  'photos-pinch-surface outline-none',
                  pinching && 'photos-pinch-active'
                )}
                style={{ touchAction: 'pan-y pinch-zoom' }}
              >
                <GalleryGrid
                  sections={sections}
                  columns={columns}
                  selectMode={false}
                  selectedIds={new Set()}
                  onToggleSelect={() => undefined}
                  onOpen={openItem}
                  onSectionVisible={density === 'all' ? onSectionVisible : undefined}
                  showInlineHeaders={preset.showSectionHeaders}
                  showOverlayHeaders={pinching && columns >= 6 && density === 'all'}
                />
              </div>
            )}
          </GalleryPinchGrid>
        )}
      </main>

      <GalleryTabBar
        density={density}
        onDensityChange={setDensity}
        searchActive={searchOpen}
        onSearchClick={() => {
          setSearchOpen((v) => !v);
          if (searchOpen) setSearchQuery('');
        }}
      />

      {lightboxIndex !== null && (
        <Lightbox
          items={flatItems}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onChange={setLightboxIndex}
          variant="ios"
          canDelete={isAdmin}
          onDelete={isAdmin ? (id) => void handleDeleteOne(id) : undefined}
        />
      )}
    </div>
  );
}
