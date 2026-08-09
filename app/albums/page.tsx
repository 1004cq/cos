'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { mapWithConcurrency } from '@/lib/utils';

type Album = {
  id: string;
  title: string;
  description?: string | null;
  coverKey?: string | null;
  _count?: { media: number };
};

export default function AlbumsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login');
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/albums');
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || '加载失败');
        }
        const list: Album[] = await res.json();
        setAlbums(list);

        const withCover = list.filter((a) => a.coverKey);
        const signed = await mapWithConcurrency(withCover, 4, async (album) => {
          try {
            const sRes = await fetch(`/api/sign?key=${encodeURIComponent(album.coverKey!)}`);
            if (!sRes.ok) return null;
            const sData = await sRes.json();
            return { id: album.id, url: sData.url as string };
          } catch {
            return null;
          }
        });
        const map: Record<string, string> = {};
        for (const item of signed) {
          if (item) map[item.id] = item.url;
        }
        setCovers(map);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [status]);

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
        <div>
          <h1 className="text-lg font-semibold tracking-tight">陈庆.我爱你</h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            相册 · {albums.length}
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href="/" className="btn-ghost !py-1.5 !px-3">
            时间轴
          </Link>
          <Link href="/admin" className="btn-ghost !py-1.5 !px-3">
            管理
          </Link>
        </div>
      </header>

      {error && <p className="text-center py-6 text-sm text-red-500">{error}</p>}

      {loading ? (
        <p className="text-center py-20" style={{ color: 'var(--text-muted)' }}>
          加载中...
        </p>
      ) : albums.length === 0 ? (
        <div className="text-center py-20 space-y-4">
          <p style={{ color: 'var(--text-muted)' }}>还没有相册</p>
          <Link href="/admin/albums" className="text-blue-600 hover:underline">
            去创建
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 pb-10 max-w-6xl mx-auto">
          {albums.map((album) => (
            <Link
              key={album.id}
              href={`/albums/${album.id}`}
              className="rounded-3xl glass overflow-hidden transition hover:shadow-lg"
            >
              <div className="aspect-[16/10] bg-white/40">
                {covers[album.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={covers[album.id]}
                    alt={album.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-sm"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    无封面
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold truncate">{album.title}</h2>
                  <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {album._count?.media ?? 0}
                  </span>
                </div>
                {album.description && (
                  <p className="text-sm mt-1 line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                    {album.description}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
