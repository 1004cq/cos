'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Lightbox, type LightboxItem } from '@/components/lightbox';
import Link from 'next/link';

type GalleryItem = LightboxItem & {
  key: string;
  thumbUrl?: string;
  kind: 'image' | 'video' | 'other';
  takenAt?: string | null;
  createdAt: string;
  duration?: number | null;
};

export default function HomePage() {
  const { status } = useSession();
  const isAdmin = status === 'authenticated';

  const [images, setImages] = useState<GalleryItem[]>([]);
  const [videos, setVideos] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'all' | 'image' | 'video'>('all');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/gallery?pageSize=80');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '加载失败');
        setImages(data.images || []);
        setVideos(data.videos || []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const lightboxItems: GalleryItem[] = useMemo(() => {
    if (tab === 'image') return images;
    if (tab === 'video') return videos;
    return [...images, ...videos];
  }, [tab, images, videos]);

  function openItem(item: GalleryItem) {
    const idx = lightboxItems.findIndex((x) => x.id === item.id);
    if (idx >= 0) setLightboxIndex(idx);
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 glass-header px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight truncate">陈庆.我爱你</h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {images.length} 张图片 · {videos.length} 个视频
          </p>
        </div>
        <div className="flex gap-2 text-sm shrink-0">
          {isAdmin ? (
            <>
              <Link href="/admin/upload" className="btn-primary !py-1.5 !px-3">
                上传
              </Link>
              <Link href="/admin" className="btn-ghost !py-1.5 !px-3">
                管理
              </Link>
            </>
          ) : (
            <Link href="/admin/login" className="btn-ghost !py-1.5 !px-3">
              管理入口
            </Link>
          )}
        </div>
      </header>

      {/* 板块切换 */}
      <div className="px-4 pt-4 flex gap-2">
        {(
          [
            { id: 'all' as const, label: '全部' },
            { id: 'image' as const, label: `图片 ${images.length}` },
            { id: 'video' as const, label: `视频 ${videos.length}` },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition ${
              tab === t.id ? 'btn-primary !rounded-full' : 'btn-ghost !rounded-full'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="text-center py-6 text-sm text-red-500">{error}</p>}

      {loading ? (
        <p className="text-center py-20" style={{ color: 'var(--text-muted)' }}>
          加载中...
        </p>
      ) : (
        <div className="pb-12 px-3 space-y-10">
          {(tab === 'all' || tab === 'image') && (
            <section>
              <div className="flex items-end justify-between px-1 mb-3">
                <h2 className="text-base font-semibold">图片</h2>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {images.length} 张
                </span>
              </div>
              {images.length === 0 ? (
                <div className="glass rounded-3xl p-10 text-center" style={{ color: 'var(--text-muted)' }}>
                  暂无图片{isAdmin ? '，去后台上传吧' : ''}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {images.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="media-tile"
                      onClick={() => openItem(item)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.thumbUrl || item.url}
                        alt={item.filename}
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {(tab === 'all' || tab === 'video') && (
            <section>
              <div className="flex items-end justify-between px-1 mb-3">
                <h2 className="text-base font-semibold">视频</h2>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {videos.length} 个
                </span>
              </div>
              {videos.length === 0 ? (
                <div className="glass rounded-3xl p-10 text-center" style={{ color: 'var(--text-muted)' }}>
                  暂无视频{isAdmin ? '，去后台上传吧' : ''}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {videos.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="glass rounded-2xl overflow-hidden text-left group"
                      onClick={() => openItem(item)}
                    >
                      <div className="relative aspect-video bg-black/5">
                        <video
                          src={item.url}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                          preload="metadata"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/20 transition">
                          <span className="w-12 h-12 rounded-full glass-strong flex items-center justify-center text-lg">
                            ▶
                          </span>
                        </div>
                      </div>
                      <div className="px-3 py-2">
                        <p className="text-sm font-medium truncate">{item.filename}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {lightboxIndex !== null && (
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
