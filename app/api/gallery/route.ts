import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSignedUrl, SIGN_CONCURRENCY } from '@/lib/cos';
import { mapWithConcurrency } from '@/lib/utils';

/**
 * 公开主页图库：无需登录
 * Query:
 *   pageSize  默认 80，最大 100
 *   type      image | video | all（默认 all）
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('pageSize') || '80', 10) || 80)
    );
    const type = searchParams.get('type') || 'all';

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

    // 并发上限 6；每条内串行签名，避免一次打爆 COS
    const signed = await mapWithConcurrency(items, SIGN_CONCURRENCY, async (m) => {
      if (!m.key.startsWith('media/')) return null;

      const isImage = m.mimeType.startsWith('image/');
      const isVideo = m.mimeType.startsWith('video/');

      try {
        const url = await getSignedUrl(m.key, 1800);
        let thumbUrl: string | null = null;
        if (isImage) {
          thumbUrl = await getSignedUrl(m.key, 1800, { thumb: true });
        } else if (isVideo) {
          try {
            thumbUrl = await getSignedUrl(m.key, 1800, { snapshot: true });
          } catch (err) {
            console.warn('gallery video snapshot failed:', m.key, err);
            thumbUrl = null;
          }
        }

        return {
          id: m.id,
          key: m.key,
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
          kind: (isVideo ? 'video' : isImage ? 'image' : 'other') as 'image' | 'video' | 'other',
        };
      } catch (err) {
        console.error('gallery sign failed:', m.key, err);
        return null;
      }
    });

    const valid = signed.filter(Boolean) as NonNullable<(typeof signed)[number]>[];
    const images = valid.filter((x) => x.kind === 'image');
    const videos = valid.filter((x) => x.kind === 'video');

    return NextResponse.json({
      images,
      videos,
      total: imageCount + videoCount,
      imageCount,
      videoCount,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '加载失败';
    console.error('gallery error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
