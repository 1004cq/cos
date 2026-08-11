import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getSignedUrl,
  GALLERY_SIGN_TTL,
  SIGN_CONCURRENCY,
} from '@/lib/cos';
import { mapWithConcurrency } from '@/lib/utils';

function watermarkEnabled(): boolean {
  const v = (process.env.COS_WATERMARK || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * 公开主页图库：无需登录
 * 网格应只使用 thumbUrl / posterUrl，勿把原片/整段视频铺列表。
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('pageSize') || '80', 10) || 80)
    );
    const type = searchParams.get('type') || 'all';
    const wm = watermarkEnabled();

    const mimeFilter =
      type === 'image'
        ? { mimeType: { startsWith: 'image/' as const } }
        : type === 'video'
          ? { mimeType: { startsWith: 'video/' as const } }
          : {};

    const [items, imageCount, videoCount] = await Promise.all([
      prisma.media.findMany({
        where: {
          ...mimeFilter,
          key: { startsWith: 'media/' },
        },
        orderBy: [{ takenAt: 'desc' }, { createdAt: 'desc' }],
        take: pageSize,
        select: {
          id: true,
          key: true,
          posterKey: true,
          filename: true,
          title: true,
          mimeType: true,
          size: true,
          width: true,
          height: true,
          duration: true,
          takenAt: true,
          createdAt: true,
        },
      }),
      prisma.media.count({
        where: { mimeType: { startsWith: 'image/' }, key: { startsWith: 'media/' } },
      }),
      prisma.media.count({
        where: { mimeType: { startsWith: 'video/' }, key: { startsWith: 'media/' } },
      }),
    ]);

    const ttl = GALLERY_SIGN_TTL;

    const signed = await mapWithConcurrency(items, SIGN_CONCURRENCY, async (m) => {
      if (!m.key.startsWith('media/')) return null;

      const isImage = m.mimeType.startsWith('image/');
      const isVideo = m.mimeType.startsWith('video/');

      try {
        // 详情原片/原片视频（点进灯箱再用）；列表禁止用其铺网格
        const url = await getSignedUrl(m.key, ttl, {
          watermark: wm && isImage,
        });
        let posterUrl: string | null = null;
        let thumbUrl: string | null = null;

        if (m.posterKey && m.posterKey.startsWith('media/')) {
          try {
            posterUrl = await getSignedUrl(m.posterKey, ttl, {
              thumb: true,
              watermark: wm,
            });
          } catch (err) {
            console.warn('gallery poster sign failed:', m.posterKey, err);
            try {
              posterUrl = await getSignedUrl(m.posterKey, ttl, { watermark: wm });
            } catch {
              posterUrl = null;
            }
          }
        }

        if (isImage) {
          try {
            thumbUrl = await getSignedUrl(m.key, ttl, {
              thumb: true,
              watermark: wm,
            });
          } catch (err) {
            console.warn('gallery image thumb failed:', m.key, err);
            // 缩略失败时不要用原图填列表（会打爆带宽）；留空由前端占位
            thumbUrl = null;
          }
        } else if (isVideo) {
          // 网格只认海报；无海报时 thumbUrl 为空（请跑 backfill-posters）
          thumbUrl = posterUrl;
        }

        return {
          id: m.id,
          key: m.key,
          posterKey: m.posterKey,
          filename: m.filename,
          title: m.title,
          mimeType: m.mimeType,
          size: m.size,
          width: m.width,
          height: m.height,
          duration: m.duration,
          takenAt: m.takenAt,
          createdAt: m.createdAt,
          url,
          thumbUrl,
          posterUrl,
          kind: (isVideo ? 'video' : isImage ? 'image' : 'other') as
            | 'image'
            | 'video'
            | 'other',
        };
      } catch (err) {
        console.error('gallery sign failed:', m.key, err);
        return null;
      }
    });

    const valid = signed.filter(Boolean) as NonNullable<(typeof signed)[number]>[];
    const images = valid.filter((x) => x.kind === 'image');
    const videos = valid.filter((x) => x.kind === 'video');

    return NextResponse.json(
      {
        images,
        videos,
        total: imageCount + videoCount,
        imageCount,
        videoCount,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=30',
        },
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '加载失败';
    console.error('gallery error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
