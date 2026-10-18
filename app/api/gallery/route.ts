import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSignedUrl, SIGN_CONCURRENCY } from '@/lib/cos';
import { getCosConfig } from '@/lib/settings';
import { mapWithConcurrency } from '@/lib/utils';
import { recordVisit } from '@/lib/visit';
import { getOrSignCached } from '@/lib/sign-cache';

/** 列表缩略/封面签名；原图改由灯箱按需 /api/sign */
const LIST_SIGN_TTL = 3600;

/**
 * 公开主页图库：无需登录
 * 仅返回 thumbUrl/posterUrl；url 置空，打开灯箱再签原图
 * Query: page（默认 1）、pageSize（默认 40，最大 100）、type
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('pageSize') || '40', 10) || 40)
    );
    const type = searchParams.get('type') || 'all';

    const mimeFilter =
      type === 'image'
        ? { mimeType: { startsWith: 'image/' as const } }
        : type === 'video'
          ? { mimeType: { startsWith: 'video/' as const } }
          : {};

    const where = {
      ...mimeFilter,
      key: { startsWith: 'media/' },
    };

    const [cfg, items, imageCount, videoCount, total] = await Promise.all([
      getCosConfig(),
      prisma.media.findMany({
        where,
        orderBy: [{ takenAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
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
      prisma.media.count({ where }),
    ]);

    const wm = Boolean(cfg.watermarkEnabled);
    const styleThumb = (cfg.imageStyleThumb || '').trim();
    const cacheVariant = `${styleThumb || 'mogr'}|wm:${wm ? 1 : 0}`;

    const signed = await mapWithConcurrency(items, SIGN_CONCURRENCY, async (m) => {
      if (!m.key.startsWith('media/')) return null;

      const isImage = m.mimeType.startsWith('image/');
      const isVideo = m.mimeType.startsWith('video/');

      try {
        let posterUrl: string | null = null;
        let thumbUrl: string | null = null;

        if (m.posterKey && m.posterKey.startsWith('media/')) {
          try {
            posterUrl = await getOrSignCached(
              m.id,
              'poster',
              LIST_SIGN_TTL,
              () =>
                getSignedUrl(
                  m.posterKey!,
                  LIST_SIGN_TTL,
                  styleThumb ? { style: styleThumb } : { thumb: true, watermark: wm }
                ),
              cacheVariant
            );
          } catch (err) {
            console.warn('gallery poster sign failed:', m.posterKey, err);
            posterUrl = null;
          }
        }

        if (isImage) {
          try {
            thumbUrl = await getOrSignCached(
              m.id,
              'thumb',
              LIST_SIGN_TTL,
              () =>
                getSignedUrl(
                  m.key,
                  LIST_SIGN_TTL,
                  styleThumb ? { style: styleThumb } : { thumb: true, watermark: wm }
                ),
              cacheVariant
            );
          } catch (err) {
            console.warn('gallery image thumb failed:', m.key, err);
            thumbUrl = null;
          }
        } else if (isVideo) {
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
          // 列表不签原图；灯箱按需 /api/sign
          url: '',
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

    const hasMore = page * pageSize < total;
    const nextPage = hasMore ? page + 1 : null;

    if (page === 1) {
      void recordVisit({
        req,
        path: '/',
        kind: 'page',
      });
    }

    return NextResponse.json(
      {
        images,
        videos,
        items: valid,
        total,
        imageCount,
        videoCount,
        page,
        pageSize,
        hasMore,
        nextPage,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
        },
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '加载失败';
    console.error('gallery error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
