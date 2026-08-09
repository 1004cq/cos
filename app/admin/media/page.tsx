'use client';

import { useCallback, useEffect, useState } from 'react';
import { LayoutGrid, List, Search, Trash2, FolderInput, Share2, Check } from 'lucide-react';
import {
  formatBytes,
  formatDateTime,
  mapWithConcurrency,
  cn,
  mediaDisplayTitle,
} from '@/lib/utils';
import { fetchSignedUrl } from '@/lib/sign-client';
import { ShareCreateDialog } from '@/components/share-create-dialog';

type Album = {
  id: string;
  title: string;
};

type MediaItem = {
  id: string;
  key: string;
  filename: string;
  title?: string | null;
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
  const [shareOpen, setShareOpen] = useState(false);
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({});
  const [savingTitleId, setSavingTitleId] = useState<string | null>(null);

  const loadThumbs = useCallback(async (media: MediaItem[]) => {
    const images = media.filter((m) => m.mimeType.startsWith('image/'));
    const signed = await mapWithConcurrency(images, 6, async (m) => {
      const url = await fetchSignedUrl(m.key, { thumb: true });
      return url ? { id: m.id, url } : null;
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

      const list: MediaItem[] = mediaData.items ?? [];
      setItems(list);
      setTotal(mediaData.total ?? 0);
      setTotalPages(mediaData.totalPages ?? 1);
      setAlbums(albumData);
      setSelected(new Set());
      const drafts: Record<string, string> = {};
      for (const m of list) {
        drafts[m.id] = m.title ?? '';
      }
      setTitleDrafts(drafts);
      void loadThumbs(list);
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

  function toggleSelectAll() {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => i.id)));
    }
  }

  async function handleBatchDelete(ids: string[]) {
    if (ids.length === 0) return;
    const tip = deleteCos
      ? `确定删除 ${ids.length} 项媒体？将先删除 COS 对象，失败则中止。`
      : `确定删除 ${ids.length} 项媒体？仅删除数据库记录。`;
    if (!confirm(tip)) return;

    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/media/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          ids,
          deleteFromCos: deleteCos,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '删除失败');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '删除失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleBatchMove() {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      setError('请先选择媒体');
      return;
    }

    const albumLabel = moveAlbumId
      ? albums.find((a) => a.id === moveAlbumId)?.title || '目标相册'
      : '未归类';
    if (!confirm(`将 ${ids.length} 项移至「${albumLabel}」？`)) return;

    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/media/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'move',
          ids,
          albumId: moveAlbumId || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '移动失败');
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

  async function saveTitle(id: string) {
    const next = (titleDrafts[id] ?? '').trim();
    setSavingTitleId(id);
    setError('');
    try {
      const res = await fetch(`/api/media/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: next || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '保存标题失败');
      setItems((prev) =>
        prev.map((m) => (m.id === id ? { ...m, title: data.title ?? null } : m))
      );
      setTitleDrafts((prev) => ({ ...prev, [id]: data.title ?? '' }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存标题失败');
    } finally {
      setSavingTitleId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">媒体库</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            共 {total} 项 · 多选后可批量移入相册、删除或生成分享
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
        <label className="flex items-center gap-1.5 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={items.length > 0 && selected.size === items.length}
            onChange={toggleSelectAll}
            disabled={items.length === 0}
          />
          全选本页
        </label>
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
          onClick={() => void handleBatchMove()}
          className="btn-ghost !py-2 text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <FolderInput className="w-4 h-4" />
          批量移入
        </button>
        <button
          type="button"
          disabled={busy || selected.size === 0}
          onClick={() => setShareOpen(true)}
          className="btn-ghost !py-2 text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <Share2 className="w-4 h-4" />
          生成分享
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
          onClick={() => void handleBatchDelete(Array.from(selected))}
          className="btn-ghost !py-2 text-sm inline-flex items-center gap-1.5 text-red-600 disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
          批量删除
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
                  <p className="text-white text-xs truncate">
                    {mediaDisplayTitle(item.title, item.filename)}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
      ) : (
        <ul className="rounded-3xl glass divide-y divide-white/40 overflow-hidden">
          {items.map((item) => {
            const draft = titleDrafts[item.id] ?? '';
            const dirty = draft.trim() !== (item.title ?? '').trim();
            return (
              <li key={item.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 text-sm">
                <div className="flex items-center gap-3 min-w-0 flex-1">
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
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                      文件名：{item.filename}
                    </p>
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        className="input-glass !py-1.5 text-sm flex-1 min-w-0"
                        maxLength={100}
                        placeholder="标题（可选）"
                        value={draft}
                        onChange={(e) =>
                          setTitleDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        type="button"
                        disabled={busy || savingTitleId === item.id || !dirty}
                        onClick={() => void saveTitle(item.id)}
                        className="btn-ghost !py-1.5 !px-2 text-xs inline-flex items-center gap-1 disabled:opacity-40"
                        title="保存标题"
                      >
                        <Check className="w-3.5 h-3.5" />
                        保存
                      </button>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {formatBytes(item.size)} · {item.album?.title || '未归类'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <time className="text-xs hidden md:block" style={{ color: 'var(--text-muted)' }}>
                    {formatDateTime(item.createdAt)}
                  </time>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleBatchDelete([item.id])}
                    className="btn-ghost !p-2 text-red-600 disabled:opacity-50"
                    aria-label="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            );
          })}
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

      <ShareCreateDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        mediaIds={Array.from(selected)}
        title={`分享已选 ${selected.size} 项`}
      />
    </div>
  );
}
