'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Images, FolderOpen, Upload, ArrowRight } from 'lucide-react';
import { formatBytes, formatDateTime } from '@/lib/utils';

type MediaItem = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  album?: { id: string; title: string } | null;
};

type AlbumItem = {
  id: string;
  title: string;
  _count?: { media: number };
};

export default function AdminDashboardPage() {
  const [mediaTotal, setMediaTotal] = useState(0);
  const [albumTotal, setAlbumTotal] = useState(0);
  const [recent, setRecent] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [mediaRes, albumsRes] = await Promise.all([
          fetch('/api/media/list?page=1&pageSize=8'),
          fetch('/api/albums'),
        ]);

        if (!mediaRes.ok) {
          const err = await mediaRes.json().catch(() => ({}));
          throw new Error(err.error || '加载媒体失败');
        }
        if (!albumsRes.ok) {
          const err = await albumsRes.json().catch(() => ({}));
          throw new Error(err.error || '加载相册失败');
        }

        const mediaData = await mediaRes.json();
        const albums: AlbumItem[] = await albumsRes.json();

        setMediaTotal(mediaData.total ?? 0);
        setRecent(mediaData.items ?? []);
        setAlbumTotal(albums.length);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">仪表盘</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            概览媒体与相册状态
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/" className="btn-ghost text-sm">
            查看时间轴
          </Link>
          <Link href="/admin/upload" className="btn-primary text-sm inline-flex items-center gap-1.5">
            <Upload className="w-4 h-4" />
            上传
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl glass px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-3xl glass p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/70 flex items-center justify-center">
              <Images className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              媒体总数
            </p>
          </div>
          <p className="text-3xl font-semibold tracking-tight">
            {loading ? '—' : mediaTotal}
          </p>
          <Link
            href="/admin/media"
            className="inline-flex items-center gap-1 text-sm text-blue-600 mt-3 hover:underline"
          >
            媒体库 <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="rounded-3xl glass p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/70 flex items-center justify-center">
              <FolderOpen className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              相册数
            </p>
          </div>
          <p className="text-3xl font-semibold tracking-tight">
            {loading ? '—' : albumTotal}
          </p>
          <Link
            href="/admin/albums"
            className="inline-flex items-center gap-1 text-sm text-blue-600 mt-3 hover:underline"
          >
            管理相册 <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <section className="rounded-3xl glass p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">最近上传</h2>
          <Link href="/admin/media" className="text-sm text-blue-600 hover:underline">
            全部
          </Link>
        </div>

        {loading ? (
          <p className="text-sm py-8 text-center" style={{ color: 'var(--text-muted)' }}>
            加载中...
          </p>
        ) : recent.length === 0 ? (
          <div className="text-center py-10 space-y-3">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              还没有媒体
            </p>
            <Link href="/admin/upload" className="btn-primary inline-block text-sm">
              去上传
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-white/40">
            {recent.map((item) => (
              <li key={item.id} className="py-3 flex items-center gap-3 text-sm">
                <span
                  className="shrink-0 w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center text-xs"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {item.mimeType.startsWith('video/') ? '▶' : '图'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.filename}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {formatBytes(item.size)}
                    {item.album ? ` · ${item.album.title}` : ' · 未归类'}
                  </p>
                </div>
                <time className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {formatDateTime(item.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
