'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ImagePlus, Share2, Trash2 } from 'lucide-react';
import { mapWithConcurrency, cn } from '@/lib/utils';
import { fetchSignedUrl } from '@/lib/sign-client';
import { ShareCreateDialog } from '@/components/share-create-dialog';
import { Lightbox, type LightboxItem } from '@/components/lightbox';

type MediaItem = {
  id: string;
  key: string;
  filename: string;
  title?: string | null;
  mimeType: string;
  size: number;
  createdAt: string;
};

type AlbumDetail = {
  id: string;
  title: string;
  description?: string | null;
  coverKey?: string | null;
  media: MediaItem[];
};

export default function AdminAlbumDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareMode, setShareMode] = useState<'album' | 'selected'>('album');
  const [shareIds, setShareIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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
    setThumbs(map);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/albums/${id}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '加载失败');
      }
      const data: AlbumDetail = await res.json();
      setAlbum(data);
      const alive = new Set((data.media || []).map((m) => m.id));
      setSelected((prev) => {
        const next = new Set<string>();
        for (const mid of prev) {
          if (alive.has(mid)) next.add(mid);
        }
        return next;
      });
      void loadThumbs(data.media || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [id, loadThumbs]);

  useEffect(() => {
    void load();
  }, [load]);

  const mediaList = album?.media ?? [];
  const pageIds = useMemo(() => mediaList.map((m) => m.id), [mediaList]);
  const allSelected = pageIds.length > 0 && pageIds.every((mid) => selected.has(mid));

  function toggleSelect(mediaId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(mediaId)) next.delete(mediaId);
      else next.add(mediaId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pageIds));
    }
  }

  function snapshotSelectedIds(): string[] {
    const alive = new Set(pageIds);
    return Array.from(selected).filter((mid) => alive.has(mid));
  }

  async function removeFromAlbum(mediaId: string) {
    if (!confirm('将该媒体移出本相册？媒体本身不会删除。')) return;
    setBusy(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch(`/api/media/${mediaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ albumId: null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '移出失败');
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(mediaId);
        return next;
      });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '移出失败');
    } finally {
      setBusy(false);
    }
  }

  async function batchRemoveFromAlbum() {
    const ids = snapshotSelectedIds();
    if (ids.length === 0) {
      setError('请先勾选媒体');
      return;
    }
    if (!confirm(`将 ${ids.length} 项移出本相册？媒体本身不会删除。`)) return;

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
          albumId: null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '批量移出失败');
      setSelected(new Set());
      setSuccessMsg(`已移出 ${data.count ?? ids.length} 项`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '批量移出失败');
    } finally {
      setBusy(false);
    }
  }

  async function setCover(key: string) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/albums/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverKey: key }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '设置封面失败');
      setAlbum((prev) => (prev ? { ...prev, coverKey: key } : prev));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '设置封面失败');
    } finally {
      setBusy(false);
    }
  }

  const lightboxItems: LightboxItem[] = useMemo(
    () =>
      mediaList.map((m) => ({
        id: m.id,
        url: thumbs[m.id] || '',
        key: m.key,
        filename: m.filename,
        title: m.title,
        mimeType: m.mimeType,
      })),
    [mediaList, thumbs]
  );

  function openPreview(mediaId: string) {
    const idx = mediaList.findIndex((m) => m.id === mediaId);
    if (idx >= 0) setLightboxIndex(idx);
  }

  if (loading) {
    return (
      <p className="text-center py-16 text-sm" style={{ color: 'var(--text-muted)' }}>
        加载中...
      </p>
    );
  }

  if (!album) {
    return (
      <div className="space-y-4">
        <p className="text-red-500 text-sm">{error || '相册不存在'}</p>
        <Link href="/admin/albums" className="btn-ghost text-sm inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />
          返回相册
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/albums"
            className="text-sm inline-flex items-center gap-1 mb-2 hover:underline"
            style={{ color: 'var(--text-muted)' }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            相册
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{album.title}</h1>
          {album.description && (
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {album.description}
            </p>
          )}
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {album.media.length} 项媒体 · 勾选多选；点击缩略图预览
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShareMode('album');
            setShareIds([]);
            setShareOpen(true);
          }}
          className="btn-primary text-sm inline-flex items-center gap-1.5"
        >
          <Share2 className="w-4 h-4" />
          分享相册
        </button>
      </div>

      {album.media.length > 0 && (
        <div className="rounded-2xl glass p-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
            />
            全选
          </label>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            已选 {selected.size}
          </span>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => {
              const ids = snapshotSelectedIds();
              if (ids.length === 0) {
                setError('请先勾选媒体');
                return;
              }
              setShareMode('selected');
              setShareIds(ids);
              setShareOpen(true);
            }}
            className="btn-ghost !py-2 text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Share2 className="w-4 h-4" />
            分享已选
          </button>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => void batchRemoveFromAlbum()}
            className="btn-ghost !py-2 text-sm inline-flex items-center gap-1.5 text-red-600 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            批量移出
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-2xl glass px-4 py-3 text-sm text-red-600">{error}</div>
      )}
      {successMsg && (
        <div className="rounded-2xl glass px-4 py-3 text-sm text-green-700">{successMsg}</div>
      )}

      {album.media.length === 0 ? (
        <div className="rounded-3xl glass p-12 text-center space-y-3">
          <p style={{ color: 'var(--text-muted)' }}>相册还没有媒体</p>
          <Link href="/admin/media" className="btn-primary inline-block text-sm">
            去媒体库归入
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {album.media.map((item) => {
            const isVideo = item.mimeType.startsWith('video/');
            const isCover = album.coverKey === item.key;
            const checked = selected.has(item.id);
            return (
              <div
                key={item.id}
                className={cn(
                  'media-tile group relative',
                  (isCover || checked) && 'ring-2 ring-blue-500'
                )}
              >
                <input
                  type="checkbox"
                  className="absolute top-2 left-2 z-20 w-4 h-4 cursor-pointer"
                  checked={checked}
                  aria-label={`选择 ${item.filename}`}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    e.stopPropagation();
                    toggleSelect(item.id);
                  }}
                />
                <button
                  type="button"
                  className="absolute inset-0 z-10 w-full h-full"
                  onClick={() => openPreview(item.id)}
                  aria-label={`预览 ${item.filename}`}
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
                </button>
                <div className="absolute inset-x-0 bottom-0 z-20 p-2 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition">
                  <p className="text-white text-xs truncate mb-1.5">{item.filename}</p>
                  <div className="flex gap-1">
                    {!isVideo && (
                      <button
                        type="button"
                        disabled={busy || isCover}
                        onClick={(e) => {
                          e.stopPropagation();
                          void setCover(item.key);
                        }}
                        className="flex-1 text-[10px] py-1 rounded-lg bg-white/90 text-[var(--text)] disabled:opacity-50 inline-flex items-center justify-center gap-0.5"
                      >
                        <ImagePlus className="w-3 h-3" />
                        {isCover ? '封面' : '设封面'}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        void removeFromAlbum(item.id);
                      }}
                      className="flex-1 text-[10px] py-1 rounded-lg bg-white/90 text-red-600 disabled:opacity-50 inline-flex items-center justify-center gap-0.5"
                    >
                      <Trash2 className="w-3 h-3" />
                      移出
                    </button>
                  </div>
                </div>
                {isCover && (
                  <span className="absolute top-2 right-2 z-20 text-[10px] px-1.5 py-0.5 rounded-md bg-blue-600 text-white">
                    封面
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ShareCreateDialog
        open={shareOpen}
        onClose={() => {
          setShareOpen(false);
          setShareIds([]);
        }}
        albumId={shareMode === 'album' ? album.id : undefined}
        mediaIds={shareMode === 'selected' ? shareIds : undefined}
        title={
          shareMode === 'selected'
            ? `分享已选 ${shareIds.length} 项`
            : `分享相册：${album.title}`
        }
        onCreated={() => {
          if (shareMode === 'selected') {
            setSelected(new Set());
          }
          setSuccessMsg('分享已创建');
        }}
      />

      {lightboxIndex !== null && lightboxItems.length > 0 && (
        <Lightbox
          items={lightboxItems}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onChange={setLightboxIndex}
        />
      )}
    </div>
  );
}
