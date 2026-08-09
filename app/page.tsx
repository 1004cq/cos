'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Lightbox, type LightboxItem } from '@/components/lightbox';
import Link from 'next/link';

type MediaRow = {
  id: string;
  key: string;
  filename: string;
  mimeType: string;
  size: number;
  width?: number | null;
  height?: number | null;
  takenAt?: string | null;
  createdAt: string;
};

type TimelineItem = LightboxItem & {
  takenAt?: string | null;
  createdAt: string;
};

export default function TimelinePage() {
  const { status } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login');
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch('/api/media/list?pageSize=60');
        if (!res.ok) throw new Error('加载失败');
        const data = await res.json();
        const media: MediaRow[] = data.items || [];

        const signed = await Promise.all(
          media.map(async (m) => {
            const sRes = await fetch(`/api/sign?key=${encodeURIComponent(m.key)}`);
            if (!sRes.ok) return null;
            const sData = await sRes.json();
            return {
              id: m.id,
              url: sData.url as string,
              filename: m.filename,
              mimeType: m.mimeType,
              width: m.width,
              height: m.height,
              takenAt: m.takenAt,
              createdAt: m.createdAt,
            } satisfies TimelineItem;
          })
        );

        setItems(signed.filter(Boolean) as TimelineItem[]);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [status]);

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>加载中...</p>
      </div>
    );
  }

  const groups: Record<string, TimelineItem[]> = {};
  for (const item of items) {
    const d = new Date(item.takenAt || item.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  const months = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 glass-header px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">陈庆.我爱你</h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            时间轴 · {items.length} 项
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href="/admin/upload" className="btn-primary !py-1.5 !px-3">
            上传
          </Link>
          <Link href="/admin/login" className="btn-ghost !py-1.5 !px-3">
            管理
          </Link>
        </div>
      </header>

      {loading ? (
        <p className="text-center py-20" style={{ color: 'var(--text-muted)' }}>
          加载中...
        </p>
      ) : items.length === 0 ? (
        <div className="text-center py-20 space-y-4">
          <p style={{ color: 'var(--text-muted)' }}>还没有照片</p>
          <Link href="/admin/upload" className="text-blue-600 hover:underline">
            去上传
          </Link>
        </div>
      ) : (
        <div className="pb-10 px-2">
          {months.map((month) => (
            <section key={month} className="mt-6">
              <h2
                className="px-2 mb-3 text-sm font-medium"
                style={{ color: 'var(--text-muted)' }}
              >
                {month}
              </h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                {groups[month].map((item) => {
                  const globalIndex = items.findIndex((x) => x.id === item.id);
                  const isVideo = item.mimeType.startsWith('video/');
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="media-tile"
                      onClick={() => setLightboxIndex(globalIndex)}
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
                        <img src={item.url} alt={item.filename} loading="lazy" />
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
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