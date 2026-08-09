'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Copy, Check, Trash2, ExternalLink } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

type ShareRow = {
  id: string;
  token: string;
  albumId: string | null;
  albumTitle: string | null;
  mediaCount: number;
  hasPassword: boolean;
  expiresAt: string | null;
  createdAt: string;
  url: string;
  expired: boolean;
};

function truncateToken(token: string): string {
  if (token.length <= 14) return token;
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}

export default function AdminSharePage() {
  const [items, setItems] = useState<ShareRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/share');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '加载失败');
      }
      setItems(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function copyLink(row: ShareRow) {
    const absolute =
      typeof window !== 'undefined' ? `${window.location.origin}${row.url}` : row.url;
    try {
      await navigator.clipboard.writeText(absolute);
      setCopiedId(row.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError('复制失败，请手动复制');
    }
  }

  async function handleDelete(row: ShareRow) {
    if (!confirm('确定删除此分享链接？对方将无法再访问。')) return;
    setBusyId(row.id);
    setError('');
    try {
      const res = await fetch(`/api/share/${row.token}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '删除失败');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '删除失败');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">分享</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            管理已创建的分享链接 · 可在相册或媒体库生成新分享
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/albums" className="btn-ghost text-sm">
            去相册
          </Link>
          <Link href="/admin/media" className="btn-primary text-sm">
            去媒体库
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl glass px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {loading ? (
        <p className="text-center py-16 text-sm" style={{ color: 'var(--text-muted)' }}>
          加载中...
        </p>
      ) : items.length === 0 ? (
        <div className="rounded-3xl glass p-12 text-center space-y-3">
          <p style={{ color: 'var(--text-muted)' }}>还没有分享链接</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            在相册详情或媒体库多选后点击「生成分享」
          </p>
        </div>
      ) : (
        <div className="rounded-3xl glass overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/40 text-left" style={{ color: 'var(--text-muted)' }}>
                  <th className="px-4 py-3 font-medium">Token</th>
                  <th className="px-4 py-3 font-medium">内容</th>
                  <th className="px-4 py-3 font-medium">密码</th>
                  <th className="px-4 py-3 font-medium">过期</th>
                  <th className="px-4 py-3 font-medium">创建</th>
                  <th className="px-4 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/40">
                {items.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 font-mono text-xs">
                      {truncateToken(row.token)}
                    </td>
                    <td className="px-4 py-3">
                      {row.albumId ? (
                        <span>
                          相册
                          {row.albumTitle ? ` · ${row.albumTitle}` : ''}
                        </span>
                      ) : (
                        <span>{row.mediaCount} 项媒体</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.hasPassword ? (
                        <span className="text-amber-700">有</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>无</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.expiresAt ? (
                        <span className={row.expired ? 'text-red-500' : undefined}>
                          {row.expired ? '已过期 · ' : ''}
                          {formatDateTime(row.expiresAt)}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>永久</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => void copyLink(row)}
                          className="btn-ghost !p-2"
                          title="复制链接"
                        >
                          {copiedId === row.id ? (
                            <Check className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-ghost !p-2"
                          title="打开"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void handleDelete(row)}
                          className="btn-ghost !p-2 text-red-600 disabled:opacity-50"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
