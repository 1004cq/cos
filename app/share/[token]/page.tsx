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
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <p className="text-zinc-400">加载中...</p>
      </div>
    );
  }

  if (needPassword) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm p-8 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4"
        >
          <h1 className="text-xl font-semibold text-center">需要密码</h1>
          <p className="text-zinc-400 text-sm text-center">此分享受密码保护</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入密码"
            className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 transition font-medium"
          >
            查看
          </button>
        </form>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="sticky top-0 z-10 bg-zinc-950/80 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <h1 className="text-lg font-medium">分享相册</h1>
        <p className="text-xs text-zinc-500">{items.length} 个文件</p>
      </header>

      {items.length === 0 ? (
        <p className="text-center text-zinc-500 py-20">暂无内容</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1 p-1">
          {items.map((item, i) => {
            const isVideo = item.mimeType.startsWith('video/');
            return (
              <button
                key={item.id}
                type="button"
                className="relative aspect-square bg-zinc-900 overflow-hidden group"
                onClick={() => setLightboxIndex(i)}
              >
                {isVideo ? (
                  <div className="w-full h-full flex items-center justify-center text-zinc-500">
                    <span className="text-3xl">▶</span>
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.url}
                    alt={item.filename}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    loading="lazy"
                  />
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