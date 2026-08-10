'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Lightbox, type LightboxItem } from '@/components/lightbox';
import Link from 'next/link';
import { cn, mediaDisplayTitle } from '@/lib/utils';

type GalleryItem = LightboxItem & {
  key: string;
  thumbUrl?: string;
  kind: 'image' | 'video' | 'other';
  takenAt?: string | null;
  createdAt: string;
  duration?: number | null;
};

type TabId = 'all' | 'image' | 'video';

/** 首页视频卡片：用 metadata / 首帧预览，避免纯灰块 */
function VideoCardPreview({
  src,
  poster,
  label,
}: {
  src: string;
  poster?: string;
  label: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setReady(false);
    setFailed(false);
  }, [src]);

  function captureFrame() {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (v.readyState >= 1 && v.currentTime < 0.05) {
        v.currentTime = 0.1;
      }
    } catch {
      /* seek 可能被打断，忽略 */
    }
  }

  return (
    <div className="relative aspect-video bg-gradient-to-br from-slate-100/80 to-slate-200/60 overflow-hidden">
      {!failed && (
        <video
          ref={videoRef}
          src={src}
          poster={poster || undefined}
          className={cn(
            'absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300',
            ready || poster ? 'opacity-100' : 'opacity-0'
          )}
          muted
          playsInline
          preload="metadata"
          controls={false}
          controlsList="nodownload noplaybackrate"
          disablePictureInPicture
          onLoadedMetadata={() => {
            captureFrame();
          }}
          onLoadedData={() => setReady(true)}
          onSeeked={() => setReady(true)}
          onError={() => setFailed(true)}
          onContextMenu={(e) => e.preventDefault()}
          aria-label={label}
        />
      )}
      {!ready && !poster && !failed && (
        <div className="absolute inset-0 animate-pulse bg-white/50" aria-hidden />
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-black/15 group-hover:bg-black/25 transition">
        <span className="w-14 h-14 min-w-[44px] min-h-[44px] rounded-full glass-strong flex items-center justify-center text-xl shadow-md pointer-events-none">
          ▶
        </span>
      </div>
    </div>
  );
}

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
          {isAdmin && (
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

      <main className="flex-1 px-3 sm:px-4 pt-4 sm:pt-6 pb-[max(3rem,calc(1.5rem+env(safe-area-inset-bottom)))]">
        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 md:gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="media-tile animate-pulse"
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
                <div className="flex items-end justify-between px-0.5 mb-3">
                  <h2 className="text-base sm:text-lg font-semibold tracking-tight">图片</h2>
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 md:gap-3">
                    {images.map((item) => {
                      const src = item.thumbUrl || item.url;
                      const label = mediaDisplayTitle(item.title, item.filename);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className="media-tile no-save shadow-sm"
                          onClick={() => openItem(item)}
                          onContextMenu={(e) => e.preventDefault()}
                          onDragStart={(e) => e.preventDefault()}
                          aria-label={label}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={src}
                            alt={label}
                            loading="lazy"
                            decoding="async"
                            className="absolute inset-0 w-full h-full object-cover"
                            draggable={false}
                          />
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {(tab === 'all' || tab === 'video') && (
              <section>
                <div className="flex items-end justify-between px-0.5 mb-3">
                  <h2 className="text-base sm:text-lg font-semibold tracking-tight">视频</h2>
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {videos.map((item) => {
                      const label = mediaDisplayTitle(item.title, item.filename);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className="glass rounded-2xl overflow-hidden text-left group min-h-[44px] no-save shadow-sm hover:shadow-md transition-shadow"
                          onClick={() => openItem(item)}
                          onContextMenu={(e) => e.preventDefault()}
                          onDragStart={(e) => e.preventDefault()}
                          aria-label={`播放 ${label}`}
                        >
                          <VideoCardPreview src={item.url} label={label} />
                          <div className="px-3.5 py-3 border-t border-white/50 bg-white/35">
                            <p className="text-sm font-medium truncate">{label}</p>
                          </div>
                        </button>
                      );
                    })}
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
