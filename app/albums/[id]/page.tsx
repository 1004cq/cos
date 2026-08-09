'use client';

import { use, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lightbox, type LightboxItem } from '@/components/lightbox';
import { mapWithConcurrency } from '@/lib/utils';
import { fetchSignedUrl } from '@/lib/sign-client';

type MediaRow = {
  id: string;
  key: string;
  filename: string;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  takenAt?: string | null;
  createdAt: string;
};

type AlbumDetail = {
  id: string;
  title: string;
  description?: string | null;
  media: MediaRow[];
};

type Item = LightboxItem & {
  key: string;
  takenAt?: string | null;
  createdAt: string;
};

const SIGN_CONCURRENCY = 6;

export default function AlbumViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { status } = useSession();
  const router = useRouter();
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login');
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/albums/${id}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || '加载失败');
        }
        const data: AlbumDetail = await res.json();
        setAlbum(data);

        const signed = await mapWithConcurrency(data.media || [], SIGN_CONCURRENCY, async (m) => {
          const isImage = m.mimeType.startsWith('image/');
          const url = await fetchSignedUrl(m.key, { thumb: isImage });
          if (!url) return null;
          return {
            id: m.id,
            key: m.key,
            url,
            filename: m.filename,
            mimeType: m.mimeType,
            width: m.width,
            height: m.height,
            takenAt: m.takenAt,
            createdAt: m.createdAt,
          } satisfies Item;
        });

        setItems(signed.filter(Boolean) as Item[]);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [status, id]);

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>加载中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 glass-header px-4 py-3 flex items-center justify-between">
        <div className="min-w-0">
          <Link
            href="/albums"
            className="text-xs hover:underline"
            style={{ color: 'var(--text-muted)' }}
          >
            ← 相册
          </Link>
          <h1 className="text-lg font-semibold tracking-tight truncate">
            {album?.title || '相册'}
          </h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {items.length} 项
            {album?.description ? ` · ${album.description}` : ''}
          </p>
        </div>
        <div className="flex gap-2 text-sm shrink-0">
          <Link href="/" className="btn-ghost !py-1.5 !px-3">
            时间轴
          </Link>
          <Link href={`/admin/albums/${id}`} className="btn-ghost !py-1.5 !px-3">
            管理
          </Link>
        </div>
      </header>

      {error && <p className="text-center py-6 text-sm text-red-500">{error}</p>}

      {loading ? (
        <p className="text-center py-20" style={{ color: 'var(--text-muted)' }}>
          加载中...
        </p>
      ) : items.length === 0 ? (
        <div className="text-center py-20 space-y-4">
          <p style={{ color: 'var(--text-muted)' }}>相册还没有内容</p>
          <Link href="/admin/media" className="text-blue-600 hover:underline">
            去媒体库归入
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 p-2 pb-10">
          {items.map((item, i) => {
            const isVideo = item.mimeType.startsWith('video/');
            return (
              <button
                key={item.id}
                type="button"
                className="media-tile no-save"
                onClick={() => setLightboxIndex(i)}
                onContextMenu={(e) => e.preventDefault()}
                onDragStart={(e) => e.preventDefault()}
              >
                {isVideo ? (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <span className="text-2xl">▶</span>
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.url}
                    alt={item.filename}
                    loading="lazy"
                    draggable={false}
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
