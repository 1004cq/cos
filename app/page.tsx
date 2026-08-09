'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Lightbox, type LightboxItem } from '@/components/lightbox';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type GalleryItem = LightboxItem & {
  key: string;
  thumbUrl?: string;
  kind: 'image' | 'video' | 'other';
  takenAt?: string | null;
  createdAt: string;
  duration?: number | null;
};

type TabId = 'all' | 'image' | 'video';

export default function HomePage() {
  const { status } = useSession();
  const isAdmin = status === 'authenticated';

  const [images, setImages] = useState<GalleryItem[]>([]);
  const [videos, setVideos] = useState<GalleryItem[]>([]);
  const [imageCount, setImageCount] = useState(0);
  const [videoCount, setVideoCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<TabId>('all');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/gallery?pageSize=80');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '加载失败');
        setImages(data.images || []);
        setVideos(data.videos || []);
        setImageCount(data.imageCount ?? (data.images || []).length);
        setVideoCount(data.videoCount ?? (data.videos || []).length);
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

  const tabs: { id: TabId; label: string }[] = [
    { id: 'all', label: '全部' },
    { id: 'image', label: `图片 ${imageCount}` },
    { id: 'video', label: `视频 ${videoCount}` },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col overflow-x-hidden">
      <header className="sticky top-0 z-20 glass-header px-3 sm:px-4 py-3 flex items-center justify-between gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-lg font-semibold tracking-tight truncate">
            陈庆.我爱你
          </h1>
          <p
            className="hidden sm:block text-xs truncate"
            style={{ color: 'var(--text-muted)' }}
          >
            {imageCount} 张图片 · {videoCount} 个视频
          </p>
        </div>
        <div className="flex gap-1.5 sm:gap-2 text-sm shrink-0">
          {isAdmin ? (
            <>
              <Link
                href="/admin/upload"
                className="btn-primary !min-h-[44px] !py-2 !px-3 text-sm"
              >
                上传
              </Link>
              <Link
                href="/admin"
                className="btn-ghost !min-h-[44px] !py-2 !px-3 text-sm"
              >
                管理
              </Link>
            </>
          ) : (
            <Link
              href="/admin/login"
              className="btn-ghost !min-h-[44px] !py-2 !px-3 text-sm"
            >
              管理入口
            </Link>
          )}
        </div>
      </header>

      <div className="px-3 sm:px-4 pt-3 sm:pt-4 flex gap-2 overflow-x-auto no-scrollbar">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setLightboxIndex(null);
            }}
            className={cn(
              'tab-pill shrink-0',
              tab === t.id
                ? 'btn-primary !rounded-full !min-h-[44px]'
                : 'btn-ghost !rounded-full !min-h-[44px]'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-center px-4 py-4 text-sm text-red-500">{error}</p>
      )}

      <main className="flex-1 px-2 sm:px-3 md:px-4 pt-4 sm:pt-6 pb-[max(3rem,calc(1.5rem+env(safe-area-inset-bottom)))]">
        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 md:gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="media-tile animate-pulse bg-white/40"
                  aria-hidden
                />
              ))}
            </div>
            <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              加载中...
            </p>
          </div>
        ) : (
          <div className="space-y-8 sm:space-y-10 md:space-y-12">
            {(tab === 'all' || tab === 'image') && (
              <section>
                <div className="flex items-end justify-between px-1 mb-2 sm:mb-3">
                  <h2 className="text-base font-semibold">图片</h2>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {images.length} 张
                  </span>
                </div>
                {images.length === 0 ? (
                  <div
                    className="glass rounded-3xl p-8 sm:p-10 text-center text-sm"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    暂无图片{isAdmin ? '，去后台上传吧' : ''}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 md:gap-3">
                    {images.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="media-tile"
                        onClick={() => openItem(item)}
                        aria-label={item.filename}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.thumbUrl || item.url}
                          alt={item.filename}
                          loading="lazy"
                          decoding="async"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}

            {(tab === 'all' || tab === 'video') && (
              <section>
                <div className="flex items-end justify-between px-1 mb-2 sm:mb-3">
                  <h2 className="text-base font-semibold">视频</h2>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {videos.length} 个
                  </span>
                </div>
                {videos.length === 0 ? (
                  <div
                    className="glass rounded-3xl p-8 sm:p-10 text-center text-sm"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    暂无视频{isAdmin ? '，去后台上传吧' : ''}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {videos.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="glass rounded-2xl overflow-hidden text-left group min-h-[44px]"
                        onClick={() => openItem(item)}
                        aria-label={`播放 ${item.filename}`}
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
                            <span className="w-12 h-12 min-w-[44px] min-h-[44px] rounded-full glass-strong flex items-center justify-center text-lg">
                              ▶
                            </span>
                          </div>
                        </div>
                        <div className="px-3 py-2.5">
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
      </main>

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
