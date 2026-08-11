'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ImagePlus, Share2, Trash2, X } from 'lucide-react';
import { mapWithConcurrency, cn } from '@/lib/utils';
import { fetchSignedUrl } from '@/lib/sign-client';
import { ShareCreateDialog } from '@/components/share-create-dialog';
import { Lightbox, type LightboxItem } from '@/components/lightbox';

type MediaItem = {
  id: string;
  key: string;
  posterKey?: string | null;
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

/** 该媒体可作为封面的对象键：图片用 key，视频用 posterKey */
function coverCandidateKey(item: MediaItem): string | null {
  if (item.mimeType.startsWith('image/') && item.key.startsWith('media/')) {
    return item.key;
  }
  if (
    item.mimeType.startsWith('video/') &&
    item.posterKey &&
    item.posterKey.startsWith('media/')
  ) {
    return item.posterKey;
  }
  return null;
}

export default function AdminAlbumDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
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
    const targets = media
      .map((m) => {
        if (m.mimeType.startsWith('image/')) return { id: m.id, key: m.key };
        if (m.mimeType.startsWith('video/') && m.posterKey) {
          return { id: m.id, key: m.posterKey };
        }
        return null;
      })
      .filter(Boolean) as { id: string; key: string }[];

    const signed = await mapWithConcurrency(targets, 6, async (m) => {
      const url = await fetchSignedUrl(m.key, { thumb: true });
      return url ? { id: m.id, url } : null;
    });
    const map: Record<string, string> = {};
    for (const item of signed) {
      if (item) map[item.id] = item.url;
    }
    setThumbs(map);
  }, []);

  const loadCoverPreview = useCallback(async (key: string | null | undefined) => {
    if (!key) {
      setCoverUrl(null);
      return;
    }
    const url = await fetchSignedUrl(key, { thumb: true });
    setCoverUrl(url);
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
      void loadCoverPreview(data.coverKey);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [id, loadThumbs, loadCoverPreview]);

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
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(pageIds));
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
        body: JSON.stringify({ action: 'move', ids, albumId: null }),
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
    setSuccessMsg('');
    try {
      const res = await fetch(`/api/albums/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverKey: key }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '设置封面失败');
      setAlbum((prev) => (prev ? { ...prev, coverKey: key } : prev));
      void loadCoverPreview(key);
      setSuccessMsg('相册封面已更新');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '设置封面失败');
    } finally {
      setBusy(false);
    }
  }

  async function clearCover() {
    if (!confirm('清除相册封面？')) return;
    setBusy(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch(`/api/albums/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverKey: null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '清除封面失败');
      setAlbum((prev) => (prev ? { ...prev, coverKey: null } : prev));
      setCoverUrl(null);
      setSuccessMsg('已清除封面');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '清除封面失败');
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
        thumbUrl: thumbs[m.id] || null,
        posterUrl:
          m.mimeType.startsWith('video/') && m.posterKey ? thumbs[m.id] || null : null,
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
            {album.media.length} 项媒体 · 点「设封面」即可更换相册封面
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

      {/* 当前封面预览 */}
      <div className="rounded-3xl glass overflow-hidden">
        <div className="aspect-[21/9] relative bg-black/5">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt="相册封面"
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-sm"
              style={{ color: 'var(--text-muted)' }}
            >
              <ImagePlus className="w-6 h-6 opacity-50" />
              <span>尚未设置封面</span>
              <span className="text-xs">在下方媒体上点「设封面」</span>
            </div>
          )}
        </div>
        <div className="p-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {album.coverKey ? '已设置自定义封面' : '未设置 · 列表可能自动用首张图'}
          </p>
          {album.coverKey && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void clearCover()}
              className="btn-ghost !py-1.5 !px-3 text-sm inline-flex items-center gap-1 text-red-600 disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
              清除封面
            </button>
          )}
        </div>
      </div>

      {album.media.length > 0 && (
        <div className="rounded-2xl glass p-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
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
            const candidate = coverCandidateKey(item);
            const isCover = Boolean(
              album.coverKey && candidate && album.coverKey === candidate
            );
            const checked = selected.has(item.id);
            const canBeCover = Boolean(candidate);
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
                  {thumbs[item.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbs[item.id]} alt={item.filename} loading="lazy" />
                  ) : isVideo ? (
                    <div
                      className="w-full h-full flex items-center justify-center bg-zinc-800 text-white/60"
                    >
                      ▶
                    </div>
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-xs"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      …
                    </div>
                  )}
                </button>

                {/* 底部操作：始终可见，方便手机点「设封面」 */}
                <div className="absolute inset-x-0 bottom-0 z-20 p-2 bg-gradient-to-t from-black/65 to-transparent">
                  <p className="text-white text-xs truncate mb-1.5">{item.filename}</p>
                  <div className="flex gap-1">
                    {canBeCover && (
                      <button
                        type="button"
                        disabled={busy || isCover}
                        onClick={(e) => {
                          e.stopPropagation();
                          void setCover(candidate!);
                        }}
                        className="flex-1 text-[10px] py-1.5 rounded-lg bg-white/95 text-[var(--text)] disabled:opacity-50 inline-flex items-center justify-center gap-0.5"
                      >
                        <ImagePlus className="w-3 h-3" />
                        {isCover ? '当前封面' : '设封面'}
                      </button>
                    )}
                    {!canBeCover && isVideo && (
                      <span className="flex-1 text-[10px] py-1.5 text-center text-white/70">
                        无海报不可设封面
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        void removeFromAlbum(item.id);
                      }}
                      className="flex-1 text-[10px] py-1.5 rounded-lg bg-white/95 text-red-600 disabled:opacity-50 inline-flex items-center justify-center gap-0.5"
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
          if (shareMode === 'selected') setSelected(new Set());
          setSuccessMsg('分享已创建');
        }}
      />

      {lightboxIndex !== null && lightboxItems.length > 0 && (
        <Lightbox
          items={lightboxItems}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onChange={setLightboxIndex}
          variant="simple"
        />
      )}
    </div>
  );
}
