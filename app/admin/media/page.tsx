'use client';

import { useCallback, useEffect, useState } from 'react';
import { LayoutGrid, List, Search, Trash2, FolderInput } from 'lucide-react';
import { formatBytes, formatDateTime, mapWithConcurrency, cn } from '@/lib/utils';

type Album = {
  id: string;
  title: string;
};

type MediaItem = {
  id: string;
  key: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  album?: { id: string; title: string } | null;
};

export default function AdminMediaPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [albums, setAlbums] = useState<Album[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveAlbumId, setMoveAlbumId] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteCos, setDeleteCos] = useState(false);

  const loadThumbs = useCallback(async (media: MediaItem[]) => {
    const images = media.filter((m) => m.mimeType.startsWith('image/'));
    const signed = await mapWithConcurrency(images, 6, async (m) => {
      try {
        const res = await fetch(`/api/sign?key=${encodeURIComponent(m.key)}`);
        if (!res.ok) return null;
        const data = await res.json();
        return { id: m.id, url: data.url as string };
      } catch {
        return null;
      }
    });
    const map: Record<string, string> = {};
    for (const item of signed) {
      if (item) map[item.id] = item.url;
    }
    setThumbs((prev) => ({ ...prev, ...map }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '24',
      });
      if (search) params.set('search', search);

      const [mediaRes, albumsRes] = await Promise.all([
        fetch(`/api/media/list?${params}`),
        fetch('/api/albums'),
      ]);

      if (!mediaRes.ok) {
        const data = await mediaRes.json().catch(() => ({}));
        throw new Error(data.error || '加载媒体失败');
      }
      if (!albumsRes.ok) {
        const data = await albumsRes.json().catch(() => ({}));
        throw new Error(data.error || '加载相册失败');
      }

      const mediaData = await mediaRes.json();
      const albumData: Album[] = await albumsRes.json();

      setItems(mediaData.items ?? []);
      setTotal(mediaData.total ?? 0);
      setTotalPages(mediaData.totalPages ?? 1);
      setAlbums(albumData);
      setSelected(new Set());
      void loadThumbs(mediaData.items ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, search, loadThumbs]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete(ids: string[]) {
    if (ids.length === 0) return;
    const tip = deleteCos
      ? `确定删除 ${ids.length} 项媒体？将同时尝试删除 COS 对象。`
      : `确定删除 ${ids.length} 项媒体？仅删除数据库记录。`;
    if (!confirm(tip)) return;

    setBusy(true);
    setError('');
    try {
      for (const id of ids) {
        const qs = deleteCos ? '?deleteFromCos=1' : '';
        const res = await fetch(`/api/media/${id}${qs}`, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '删除失败');
      }
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '删除失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleMove() {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      setError('请先选择媒体');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const albumId = moveAlbumId || null;
      for (const id of ids) {
        const res = await fetch(`/api/media/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ albumId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '移动失败');
      }
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '移动失败');
    } finally {
      setBusy(false);
    }
  }

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">媒体库</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            共 {total} 项 · 支持搜索、移入相册、删除
          </p>
        </div>
        <div className="flex gap-1 rounded-xl glass p-1">
          <button
            type="button"
            onClick={() => setView('grid')}
            className={cn(
              'p-2 rounded-lg transition',
              view === 'grid' ? 'bg-white/80 text-blue-600' : 'hover:bg-white/40'
            )}
            aria-label="网格"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            className={cn(
              'p-2 rounded-lg transition',
              view === 'list' ? 'bg-white/80 text-blue-600' : 'hover:bg-white/40'
            )}
            aria-label="列表"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      <form onSubmit={onSearchSubmit} className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: 'var(--text-muted)' }}
          />
          <input
            className="input-glass !pl-10"
            placeholder="搜索文件名..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary text-sm">
          搜索
        </button>
      </form>

      <div className="rounded-2xl glass p-3 flex flex-wrap items-center gap-3">
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
          已选 {selected.size}
        </span>
        <select
          className="input-glass !w-auto !py-2 text-sm"
          value={moveAlbumId}
          onChange={(e) => setMoveAlbumId(e.target.value)}
        >
          <option value="">移出相册 / 未归类</option>
          {albums.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || selected.size === 0}
          onClick={() => void handleMove()}
          className="btn-ghost !py-2 text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <FolderInput className="w-4 h-4" />
          移入相册
        </button>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={deleteCos}
            onChange={(e) => setDeleteCos(e.target.checked)}
          />
          同时删 COS
        </label>
        <button
          type="button"
          disabled={busy || selected.size === 0}
          onClick={() => void handleDelete(Array.from(selected))}
          className="btn-ghost !py-2 text-sm inline-flex items-center gap-1.5 text-red-600 disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
          删除
        </button>
      </div>

      {error && (
        <div className="rounded-2xl glass px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {loading ? (
        <p className="text-center py-16 text-sm" style={{ color: 'var(--text-muted)' }}>
          加载中...
        </p>
      ) : items.length === 0 ? (
        <div className="rounded-3xl glass p-12 text-center" style={{ color: 'var(--text-muted)' }}>
          没有匹配的媒体
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {items.map((item) => {
            const isVideo = item.mimeType.startsWith('video/');
            const checked = selected.has(item.id);
            return (
              <label
                key={item.id}
                className={cn(
                  'media-tile cursor-pointer block',
                  checked && 'ring-2 ring-blue-500'
                )}
              >
                <input
                  type="checkbox"
                  className="absolute top-2 left-2 z-10 w-4 h-4"
                  checked={checked}
                  onChange={() => toggleSelect(item.id)}
                />
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
                <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/40 to-transparent">
                  <p className="text-white text-xs truncate">{item.filename}</p>
                </div>
              </label>
            );
          })}
        </div>
      ) : (
        <ul className="rounded-3xl glass divide-y divide-white/40 overflow-hidden">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                onChange={() => toggleSelect(item.id)}
              />
              <span
                className="w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center text-xs shrink-0"
                style={{ color: 'var(--text-muted)' }}
              >
                {item.mimeType.startsWith('video/') ? '▶' : '图'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.filename}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {formatBytes(item.size)} · {item.album?.title || '未归类'}
                </p>
              </div>
              <time className="text-xs shrink-0 hidden sm:block" style={{ color: 'var(--text-muted)' }}>
                {formatDateTime(item.createdAt)}
              </time>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDelete([item.id])}
                className="btn-ghost !p-2 text-red-600 disabled:opacity-50"
                aria-label="删除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="btn-ghost text-sm disabled:opacity-50"
          >
            上一页
          </button>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="btn-ghost text-sm disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
