'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mapWithConcurrency } from '@/lib/utils';
import { fetchSignedUrl } from '@/lib/sign-client';
import type { LightboxItem } from '@/components/lightbox';
import {
  toDatetimeLocalValue,
  type Album,
  type MediaItem,
} from '@/components/admin/media-types';

export function useAdminMedia() {

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
  const [successMsg, setSuccessMsg] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveAlbumId, setMoveAlbumId] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteCos, setDeleteCos] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareIds, setShareIds] = useState<string[]>([]);
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({});
  const [takenAtDrafts, setTakenAtDrafts] = useState<Record<string, string>>({});
  const [savingTitleId, setSavingTitleId] = useState<string | null>(null);
  const [savingTakenAtId, setSavingTakenAtId] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // 翻页/搜索变化时清空选中；列表刷新本身不清空（避免勾选被冲掉）
  const selectionResetKey = `${page}:${search}`;
  const prevResetKey = useRef(selectionResetKey);

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

  const load = useCallback(
    async (opts?: { clearSelection?: boolean }) => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: '24',
          sort: 'createdAt',
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

        if (opts?.clearSelection) {
          setSelected(new Set());
        } else {
          // 仅保留仍存在于当前页的选中 id，避免「已勾选但提交无效」
          const alive = new Set(list.map((m) => m.id));
          setSelected((prev) => {
            const next = new Set<string>();
            for (const id of prev) {
              if (alive.has(id)) next.add(id);
            }
            return next;
          });
        }

        const drafts: Record<string, string> = {};
        const takenDrafts: Record<string, string> = {};
        for (const m of list) {
          drafts[m.id] = m.title ?? '';
          takenDrafts[m.id] = toDatetimeLocalValue(m.takenAt);
        }
        setTitleDrafts(drafts);
        setTakenAtDrafts(takenDrafts);
        void loadThumbs(list);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        setLoading(false);
      }
    },
    [page, search, loadThumbs]
  );

  useEffect(() => {
    const shouldClear = prevResetKey.current !== selectionResetKey;
    prevResetKey.current = selectionResetKey;
    void load({ clearSelection: shouldClear });
  }, [load, selectionResetKey]);

  const pageIds = useMemo(() => items.map((i) => i.id), [items]);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allPageSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of pageIds) next.delete(id);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of pageIds) next.add(id);
        return next;
      });
    }
  }

  /** 提交时快照当前选中，并过滤到仍存在的媒体 id */
  function snapshotSelectedIds(): string[] {
    const alive = new Set(items.map((m) => m.id));
    return Array.from(selected).filter((id) => alive.has(id));
  }

  async function handleBatchDelete(ids: string[]) {
    if (ids.length === 0) {
      setError('请先勾选要删除的媒体');
      return;
    }
    const tip = deleteCos
      ? `确定删除 ${ids.length} 项媒体？将先删除 COS 对象，失败则中止。`
      : `确定删除 ${ids.length} 项媒体？仅删除数据库记录。`;
    if (!confirm(tip)) return;

    setBusy(true);
    setError('');
    setSuccessMsg('');
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
      setSelected(new Set());
      setSuccessMsg(`已删除 ${data.count ?? ids.length} 项`);
      await load({ clearSelection: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '删除失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleBatchMove() {
    const ids = snapshotSelectedIds();
    if (ids.length === 0) {
      setError('请先勾选要移动的媒体');
      return;
    }

    const albumLabel = moveAlbumId
      ? albums.find((a) => a.id === moveAlbumId)?.title || '目标相册'
      : '未归类';
    if (!confirm(`将 ${ids.length} 项移至「${albumLabel}」？`)) return;

    setBusy(true);
    setError('');
    setSuccessMsg('');
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
      setSelected(new Set());
      setSuccessMsg(`已移动 ${data.count ?? ids.length} 项至「${albumLabel}」`);
      await load({ clearSelection: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '移动失败');
    } finally {
      setBusy(false);
    }
  }

  function openShareSelected() {
    const ids = snapshotSelectedIds();
    if (ids.length === 0) {
      setError('请先勾选要分享的媒体');
      return;
    }
    setShareIds(ids);
    setShareOpen(true);
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
    setSuccessMsg('');
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
      setSuccessMsg('标题已保存');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存标题失败');
    } finally {
      setSavingTitleId(null);
    }
  }

  async function saveTakenAt(id: string) {
    const draft = (takenAtDrafts[id] ?? '').trim();
    setSavingTakenAtId(id);
    setError('');
    setSuccessMsg('');
    try {
      const payload =
        draft === ''
          ? { takenAt: null }
          : { takenAt: new Date(draft).toISOString() };
      if (draft && Number.isNaN(new Date(draft).getTime())) {
        throw new Error('拍摄时间格式无效');
      }
      const res = await fetch(`/api/media/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '保存时间失败');
      const nextTaken =
        data.takenAt == null
          ? null
          : typeof data.takenAt === 'string'
            ? data.takenAt
            : new Date(data.takenAt).toISOString();
      setItems((prev) =>
        prev.map((m) => (m.id === id ? { ...m, takenAt: nextTaken } : m))
      );
      setTakenAtDrafts((prev) => ({
        ...prev,
        [id]: toDatetimeLocalValue(nextTaken),
      }));
      setSuccessMsg(nextTaken ? '拍摄/展示时间已保存' : '已清空拍摄时间（将按入库时间排序）');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存时间失败');
    } finally {
      setSavingTakenAtId(null);
    }
  }

  const lightboxItems: LightboxItem[] = useMemo(
    () =>
      items.map((m) => ({
        id: m.id,
        url: thumbs[m.id] || '',
        key: m.key,
        filename: m.filename,
        title: m.title,
        mimeType: m.mimeType,
        takenAt: m.takenAt,
        createdAt: m.createdAt,
      })),
    [items, thumbs]
  );

  const [backfilling, setBackfilling] = useState(false);

  async function handleBackfillPosters() {
    if (backfilling || busy) return;
    setBackfilling(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/admin/media/backfill-posters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 50 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '补封面失败');
      setSuccessMsg(
        `视频封面补全：成功 ${data.ok ?? 0} / 尝试 ${data.attempted ?? 0}`
      );
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '补封面失败');
    } finally {
      setBackfilling(false);
    }
  }

  function openPreview(id: string) {
    const idx = items.findIndex((m) => m.id === id);
    if (idx >= 0) setLightboxIndex(idx);
  }

  const selectedCount = selected.size;

  return {
    items,
    thumbs,
    albums,
    page,
    setPage,
    totalPages,
    total,
    search,
    searchInput,
    setSearchInput,
    view,
    setView,
    loading,
    error,
    successMsg,
    selected,
    setSelected,
    moveAlbumId,
    setMoveAlbumId,
    busy,
    deleteCos,
    setDeleteCos,
    shareOpen,
    setShareOpen,
    shareIds,
    setShareIds,
    titleDrafts,
    setTitleDrafts,
    takenAtDrafts,
    setTakenAtDrafts,
    savingTitleId,
    savingTakenAtId,
    lightboxIndex,
    setLightboxIndex,
    lightboxItems,
    backfilling,
    allPageSelected,
    selectedCount,
    toggleSelect,
    toggleSelectAll,
    snapshotSelectedIds,
    handleBatchDelete,
    handleBatchMove,
    openShareSelected,
    onSearchSubmit,
    saveTitle,
    saveTakenAt,
    handleBackfillPosters,
    openPreview,
    load,
    setItems,
    setError,
    setSuccessMsg,
    setSavingTakenAtId,
  };
}
