'use client';

import { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  /** 分享整个相册 */
  albumId?: string;
  /** 分享指定媒体 */
  mediaIds?: string[];
  title?: string;
  /** 创建成功后回调（用于清空多选等） */
  onCreated?: () => void;
};

const EXPIRE_OPTIONS = [
  { label: '1 天', value: 24 * 3600 },
  { label: '7 天', value: 7 * 24 * 3600 },
  { label: '30 天', value: 30 * 24 * 3600 },
  { label: '永久', value: 0 },
];

export function ShareCreateDialog({
  open,
  onClose,
  albumId,
  mediaIds,
  title,
  onCreated,
}: Props) {
  const [password, setPassword] = useState('');
  const [expiresIn, setExpiresIn] = useState(7 * 24 * 3600);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [createdUrl, setCreatedUrl] = useState('');
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setCreatedUrl('');
    setCopied(false);

    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          albumId: albumId || undefined,
          mediaIds: mediaIds && mediaIds.length > 0 ? mediaIds : undefined,
          password: password.trim() || undefined,
          expiresIn,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '创建失败');

      const absolute =
        typeof window !== 'undefined'
          ? `${window.location.origin}${data.url}`
          : data.url;
      setCreatedUrl(absolute);
      onCreated?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    if (!createdUrl) return;
    try {
      await navigator.clipboard.writeText(createdUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('复制失败，请手动复制');
    }
  }

  function handleClose() {
    setPassword('');
    setExpiresIn(7 * 24 * 3600);
    setError('');
    setCreatedUrl('');
    setCopied(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/25 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl glass-strong p-6 space-y-4 relative">
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 btn-ghost !p-2"
          aria-label="关闭"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-lg font-semibold pr-8">{title || '生成分享'}</h2>

        {createdUrl ? (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              分享已创建，可将链接发给对方。
            </p>
            <div className="flex gap-2">
              <input className="input-glass text-sm" value={createdUrl} readOnly />
              <button
                type="button"
                onClick={() => void copyLink()}
                className="btn-primary !px-3 shrink-0 inline-flex items-center gap-1"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? '已复制' : '复制'}
              </button>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={handleClose} className="btn-ghost text-sm">
                完成
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm mb-1.5 font-medium">访问密码（可选）</label>
              <input
                type="text"
                className="input-glass"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="留空则无密码"
              />
            </div>

            <div>
              <label className="block text-sm mb-1.5 font-medium">有效期</label>
              <select
                className="input-glass"
                value={expiresIn}
                onChange={(e) => setExpiresIn(Number(e.target.value))}
              >
                {EXPIRE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {albumId && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                将分享整个相册
              </p>
            )}
            {mediaIds && mediaIds.length > 0 && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                将分享已选的 {mediaIds.length} 项媒体
              </p>
            )}

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={handleClose} className="btn-ghost text-sm">
                取消
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn-primary text-sm disabled:opacity-50"
              >
                {saving ? '创建中...' : '创建分享'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
