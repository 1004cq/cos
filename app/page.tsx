'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { MoreHorizontal, Search, X } from 'lucide-react';
import { Lightbox } from '@/components/lightbox';
import { GalleryGrid, type DaySection } from '@/components/gallery-grid';
import { GalleryTabBar } from '@/components/gallery-tab-bar';
import type { GalleryItem, GalleryViewMode } from '@/components/gallery-types';
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

function buildSections(
  items: GalleryItem[],
  mode: GalleryViewMode
): DaySection[] {
  const sorted = [...items].sort(
    (a, b) => itemSortDate(b).getTime() - itemSortDate(a).getTime()
  );

  if (mode === 'year') {
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

  if (mode === 'month') {
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

  // library / all — 按日分组
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
  const [viewMode, setViewMode] = useState<GalleryViewMode>('library');
  const [headerDateKey, setHeaderDateKey] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    () => buildSections(filteredItems, viewMode === 'all' ? 'library' : viewMode),
    [filteredItems, viewMode]
  );

  const flatItems = useMemo(
    () => sections.flatMap((s) => s.items),
    [sections]
  );

  const headerLabel = useMemo(() => {
    if (headerDateKey) {
      const sec = sections.find((s) => s.key === headerDateKey);
      if (sec) return sec.label;
    }
    return sections[0]?.label ?? '';
  }, [headerDateKey, sections]);

  const onSectionVisible = useCallback((key: string) => {
    setHeaderDateKey(key);
  }, []);

  function openItem(item: GalleryItem) {
    const idx = flatItems.findIndex((x) => x.id === item.id);
    if (idx >= 0) setLightboxIndex(idx);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  async function batchDeleteSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0 || !isAdmin) return;
    if (!confirm(`确定删除 ${ids.length} 项？`)) return;
    setDeleting(true);
    setError('');
    try {
      const res = await fetch('/api/media/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', ids, deleteFromCos: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '删除失败');
      setItems((prev) => prev.filter((i) => !selected.has(i.id)));
      exitSelectMode();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteOne(id: string) {
    if (!isAdmin) return;
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

  return (
    <div className="photos-app min-h-[100dvh] flex flex-col bg-[#FFFFFF]">
      {/* 顶栏 */}
      <header
        className="sticky top-0 z-20 bg-[#FFFFFF]/92 backdrop-blur-xl border-b border-black/[0.06]"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex items-start justify-between gap-2 px-4 pt-2 pb-2 min-h-[52px]">
          <div className="min-w-0 flex-1">
            {selectMode ? (
              <>
                <button
                  type="button"
                  className="text-[17px] font-semibold text-[#007AFF]"
                  onClick={exitSelectMode}
                >
                  取消
                </button>
                <p className="text-[13px] text-[var(--photos-muted)] mt-0.5">
                  已选择 {selected.size} 项
                </p>
              </>
            ) : (
              <>
                <h1 className="text-[34px] font-bold leading-tight tracking-tight text-black">
                  图库
                </h1>
                {!loading && headerLabel && (
                  <p className="text-[15px] font-semibold text-black/80 mt-0.5">{headerLabel}</p>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 pt-1">
            {selectMode ? (
              <>
                {isAdmin && selected.size > 0 && (
                  <button
                    type="button"
                    disabled={deleting}
                    className="photos-pill-btn text-red-500"
                    onClick={() => void batchDeleteSelected()}
                  >
                    删除
                  </button>
                )}
                <button type="button" className="photos-pill-btn photos-pill-btn-primary" onClick={exitSelectMode}>
                  完成
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="photos-pill-btn"
                  onClick={() => setSelectMode(true)}
                >
                  选择
                </button>
                <button
                  type="button"
                  className="photos-icon-btn"
                  aria-label="更多"
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  <MoreHorizontal className="w-5 h-5" />
                </button>
              </>
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

        {menuOpen && !selectMode && (
          <div className="absolute right-4 z-30 mt-1 rounded-xl bg-white shadow-lg border border-black/5 py-1 min-w-[160px]">
            {isAdmin && (
              <>
                <Link
                  href="/admin/upload"
                  className="block px-4 py-2.5 text-[15px] hover:bg-black/5"
                  onClick={() => setMenuOpen(false)}
                >
                  上传
                </Link>
                <Link
                  href="/admin"
                  className="block px-4 py-2.5 text-[15px] hover:bg-black/5"
                  onClick={() => setMenuOpen(false)}
                >
                  管理后台
                </Link>
              </>
            )}
            <Link
              href="/albums"
              className="block px-4 py-2.5 text-[15px] hover:bg-black/5"
              onClick={() => setMenuOpen(false)}
            >
              相册
            </Link>
          </div>
        )}
      </header>

      {error && <p className="text-center px-4 py-3 text-sm text-red-500">{error}</p>}

      <main
        className={cn(
          'flex-1 pb-[calc(72px+env(safe-area-inset-bottom))]',
          viewMode === 'library' && 'photos-grid-wrap'
        )}
      >
        {loading ? (
          <div className="photos-grid">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-square bg-[#E5E5EA] animate-pulse" />
            ))}
          </div>
        ) : (
          <GalleryGrid
            sections={sections}
            selectMode={selectMode}
            selectedIds={selected}
            onToggleSelect={toggleSelect}
            onOpen={openItem}
            onSectionVisible={viewMode === 'library' || viewMode === 'all' ? onSectionVisible : undefined}
            showInlineHeaders={viewMode !== 'library' && viewMode !== 'all'}
          />
        )}
      </main>

      {!selectMode && (
        <GalleryTabBar
          mode={viewMode}
          onModeChange={(m) => {
            setViewMode(m);
            setLightboxIndex(null);
          }}
          searchActive={searchOpen}
          onSearchClick={() => {
            setSearchOpen((v) => !v);
            if (searchOpen) setSearchQuery('');
          }}
        />
      )}

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
