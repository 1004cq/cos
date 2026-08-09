'use client';

import { useEffect, useState, use } from 'react';
import { Lightbox, type LightboxItem } from '@/components/lightbox';

type MediaItem = LightboxItem & {
  size: number;
  duration?: number | null;
  takenAt?: string | null;
};

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [needPassword, setNeedPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  async function load(pwd?: string) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/share/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd || '' }),
      });
      const data = await res.json();

      if (res.status === 401 && data.needPassword) {
        setNeedPassword(true);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError(data.error || '加载失败');
        setLoading(false);
        return;
      }

      setNeedPassword(false);
      setItems(data.items || []);
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    load(password);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>加载中...</p>
      </div>
    );
  }

  if (needPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <form onSubmit={handleSubmit} className="w-full max-w-sm p-8 rounded-3xl glass-strong space-y-4">
          <h1 className="text-xl font-semibold text-center">需要密码</h1>
          <p className="text-sm text-center" style={{ color: 'var(--text-muted)' }}>
            此分享受密码保护
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入密码"
            className="input-glass"
            autoFocus
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" className="btn-primary w-full">
            查看
          </button>
        </form>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 glass-header px-4 py-3">
        <h1 className="text-lg font-medium">分享相册</h1>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {items.length} 个文件
        </p>
      </header>

      {items.length === 0 ? (
        <p className="text-center py-20" style={{ color: 'var(--text-muted)' }}>
          暂无内容
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 p-2">
          {items.map((item, i) => {
            const isVideo = item.mimeType.startsWith('video/');
            return (
              <button
                key={item.id}
                type="button"
                className="media-tile"
                onClick={() => setLightboxIndex(i)}
              >
                {isVideo ? (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <span className="text-3xl">▶</span>
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt={item.filename} loading="lazy" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {lightboxIndex !== null && (
        <Lightbox
          items={items}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onChange={setLightboxIndex}
        />
      )}
    </div>
  );
}