'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Images, FolderOpen, Upload, ArrowRight, Share2, HardDrive } from 'lucide-react';
import { formatBytes, formatDateTime } from '@/lib/utils';

type MediaItem = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  album?: { id: string; title: string } | null;
};

type Stats = {
  mediaTotal: number;
  albumTotal: number;
  shareTotal: number;
  shareActive: number;
  shareExpired: number;
  totalBytes: number;
  imageCount: number;
  videoCount: number;
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [statsRes, mediaRes] = await Promise.all([
          fetch('/api/stats'),
          fetch('/api/media/list?page=1&pageSize=8'),
        ]);

        if (!statsRes.ok) {
          const err = await statsRes.json().catch(() => ({}));
          throw new Error(err.error || '加载统计失败');
        }
        if (!mediaRes.ok) {
          const err = await mediaRes.json().catch(() => ({}));
          throw new Error(err.error || '加载媒体失败');
        }

        setStats(await statsRes.json());
        const mediaData = await mediaRes.json();
        setRecent(mediaData.items ?? []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">仪表盘</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            概览媒体、相册与分享
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/" className="btn-ghost text-sm">
            时间轴
          </Link>
          <Link href="/albums" className="btn-ghost text-sm">
            相册
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-3xl glass p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/70 flex items-center justify-center">
              <Images className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              媒体
            </p>
          </div>
          <p className="text-3xl font-semibold tracking-tight">
            {loading || !stats ? '—' : stats.mediaTotal}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {stats
              ? `图 ${stats.imageCount} · 视频 ${stats.videoCount}`
              : '图片 / 视频'}
          </p>
          <Link
            href="/admin/media"
            className="inline-flex items-center gap-1 text-sm text-blue-600 mt-3 hover:underline"
          >
            媒体库 <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="rounded-3xl glass p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/70 flex items-center justify-center">
              <FolderOpen className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              相册
            </p>
          </div>
          <p className="text-3xl font-semibold tracking-tight">
            {loading || !stats ? '—' : stats.albumTotal}
          </p>
          <Link
            href="/admin/albums"
            className="inline-flex items-center gap-1 text-sm text-blue-600 mt-3 hover:underline"
          >
            管理相册 <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="rounded-3xl glass p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/70 flex items-center justify-center">
              <Share2 className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              分享
            </p>
          </div>
          <p className="text-3xl font-semibold tracking-tight">
            {loading || !stats ? '—' : stats.shareTotal}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {stats
              ? `有效 ${stats.shareActive} · 过期 ${stats.shareExpired}`
              : '有效 / 过期'}
          </p>
          <Link
            href="/admin/share"
            className="inline-flex items-center gap-1 text-sm text-blue-600 mt-3 hover:underline"
          >
            分享管理 <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="rounded-3xl glass p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/70 flex items-center justify-center">
              <HardDrive className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              占用体积
            </p>
          </div>
          <p className="text-3xl font-semibold tracking-tight">
            {loading || !stats ? '—' : formatBytes(stats.totalBytes)}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            按数据库记录合计
          </p>
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
