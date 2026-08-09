'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Pencil, Plus, Share2, Trash2, X } from 'lucide-react';
import { mapWithConcurrency } from '@/lib/utils';
import { fetchSignedUrl } from '@/lib/sign-client';
import { ShareCreateDialog } from '@/components/share-create-dialog';

type Album = {
  id: string;
  title: string;
  description?: string | null;
  coverKey?: string | null;
  isPublic: boolean;
  sortOrder: number;
  createdAt: string;
  _count?: { media: number };
};

type FormState = {
  title: string;
  description: string;
  isPublic: boolean;
};

const emptyForm: FormState = { title: '', description: '', isPublic: false };

export default function AdminAlbumsPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Album | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [shareAlbum, setShareAlbum] = useState<Album | null>(null);

  const loadCovers = useCallback(async (list: Album[]) => {
    const withCover = list.filter((a) => a.coverKey);
    const signed = await mapWithConcurrency(withCover, 4, async (album) => {
      const url = await fetchSignedUrl(album.coverKey!, { thumb: true });
      return url ? { id: album.id, url } : null;
    });

    const map: Record<string, string> = {};
    for (const item of signed) {
      if (item) map[item.id] = item.url;
    }
    setCovers(map);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/albums');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '加载失败');
      }
      const data: Album[] = await res.json();
      setAlbums(data);
      void loadCovers(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [loadCovers]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(album: Album) {
    setEditing(album);
    setForm({
      title: album.title,
      description: album.description || '',
      isPublic: album.isPublic,
    });
    setFormError('');
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setFormError('标题不能为空');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const url = editing ? `/api/albums/${editing.id}` : '/api/albums';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          isPublic: form.isPublic,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '保存失败');
      setModalOpen(false);
      await load();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(album: Album) {
    if (!confirm(`确定删除相册「${album.title}」？媒体不会被删除。`)) return;
    try {
      const res = await fetch(`/api/albums/${album.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '删除失败');
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '删除失败');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">相册</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            创建与管理相册，媒体可归入相册
          </p>
        </div>
        <button type="button" onClick={openCreate} className="btn-primary inline-flex items-center gap-1.5 text-sm">
          <Plus className="w-4 h-4" />
          新建相册
        </button>
      </div>

      {error && (
        <div className="rounded-2xl glass px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {loading ? (
        <p className="text-center py-16 text-sm" style={{ color: 'var(--text-muted)' }}>
          加载中...
        </p>
      ) : albums.length === 0 ? (
        <div className="rounded-3xl glass p-12 text-center space-y-4">
          <p style={{ color: 'var(--text-muted)' }}>还没有相册</p>
          <button type="button" onClick={openCreate} className="btn-primary text-sm">
            创建第一个
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {albums.map((album) => (
            <article key={album.id} className="rounded-3xl glass overflow-hidden flex flex-col">
              <Link href={`/admin/albums/${album.id}`} className="aspect-[16/10] bg-white/40 relative block">
                {covers[album.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={covers[album.id]}
                    alt={album.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-sm"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    无封面
                  </div>
                )}
              </Link>
              <div className="p-4 flex-1 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/admin/albums/${album.id}`} className="font-semibold truncate hover:underline">
                    {album.title}
                  </Link>
                  <span
                    className="text-xs shrink-0 px-2 py-0.5 rounded-lg bg-white/60"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {album._count?.media ?? 0} 项
                  </span>
                </div>
                {album.description && (
                  <p className="text-sm line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                    {album.description}
                  </p>
                )}
                <div className="mt-auto pt-2 flex flex-wrap gap-2">
                  <Link
                    href={`/admin/albums/${album.id}`}
                    className="btn-ghost !py-1.5 !px-3 text-sm"
                  >
                    详情
                  </Link>
                  <button
                    type="button"
                    onClick={() => setShareAlbum(album)}
                    className="btn-ghost !py-1.5 !px-3 text-sm inline-flex items-center gap-1"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    分享
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(album)}
                    className="btn-ghost !py-1.5 !px-3 text-sm inline-flex items-center gap-1"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(album)}
                    className="btn-ghost !py-1.5 !px-3 text-sm inline-flex items-center gap-1 text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    删除
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <ShareCreateDialog
        open={Boolean(shareAlbum)}
        onClose={() => setShareAlbum(null)}
        albumId={shareAlbum?.id}
        title={shareAlbum ? `分享相册：${shareAlbum.title}` : '生成分享'}
      />

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/25 backdrop-blur-sm">
          <form
            onSubmit={handleSave}
            className="w-full max-w-md rounded-3xl glass-strong p-6 space-y-4 relative"
          >
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="absolute right-4 top-4 btn-ghost !p-2"
              aria-label="关闭"
            >
              <X className="w-4 h-4" />
            </button>
            <h2 className="text-lg font-semibold pr-8">
              {editing ? '编辑相册' : '新建相册'}
            </h2>

            <div>
              <label className="block text-sm mb-1.5 font-medium">标题</label>
              <input
                className="input-glass"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm mb-1.5 font-medium">描述</label>
              <textarea
                className="input-glass min-h-[88px] resize-y"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.isPublic}
                onChange={(e) => setForm((f) => ({ ...f, isPublic: e.target.checked }))}
                className="rounded"
              />
              标记为公开（后续扩展）
            </label>

            {formError && <p className="text-sm text-red-500">{formError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModalOpen(false)} className="btn-ghost text-sm">
                取消
              </button>
              <button type="submit" disabled={saving} className="btn-primary text-sm disabled:opacity-50">
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
