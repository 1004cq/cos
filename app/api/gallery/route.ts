import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSignedUrl, SIGN_CONCURRENCY } from '@/lib/cos';
import { getCosConfig } from '@/lib/settings';
import { mapWithConcurrency } from '@/lib/utils';

/** 列表缩略/封面签名稍长，减少 20 人同时反复打 gallery */
const LIST_SIGN_TTL = 3600;
const ORIGIN_SIGN_TTL = 1800;

/**
 * 公开主页图库：无需登录
 * 列表只依赖 thumbUrl/posterUrl，原图 url 供详情使用
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

    const [cfg, items, imageCount, videoCount] = await Promise.all([
      getCosConfig(),
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

    const wm = Boolean(cfg.watermarkEnabled);

    const signed = await mapWithConcurrency(items, SIGN_CONCURRENCY, async (m) => {
      if (!m.key.startsWith('media/')) return null;

      const isImage = m.mimeType.startsWith('image/');
      const isVideo = m.mimeType.startsWith('video/');

      try {
        // 图片详情预览可加水印；视频原片与管理端下载不加
        const url = await getSignedUrl(
          m.key,
          ORIGIN_SIGN_TTL,
          isImage && wm ? { watermark: true } : undefined
        );
        let posterUrl: string | null = null;
        let thumbUrl: string | null = null;

        if (m.posterKey && m.posterKey.startsWith('media/')) {
          try {
            posterUrl = await getSignedUrl(m.posterKey, LIST_SIGN_TTL, {
              thumb: true,
              watermark: wm,
            });
          } catch {
            try {
              posterUrl = await getSignedUrl(m.posterKey, LIST_SIGN_TTL, {
                watermark: wm,
              });
            } catch (err) {
              console.warn('gallery poster sign failed:', m.posterKey, err);
            }
          }
        }

        if (isImage) {
          try {
            // 列表禁止回退到原图 url，避免网格拉数 MB 原片
            thumbUrl = await getSignedUrl(m.key, LIST_SIGN_TTL, {
              thumb: true,
              watermark: wm,
            });
          } catch (err) {
            console.warn('gallery image thumb failed:', m.key, err);
            thumbUrl = null;
          }
        } else if (isVideo) {
          if (posterUrl) {
            thumbUrl = posterUrl;
          } else {
            thumbUrl = null;
          }
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
          // 短缓存，减轻 20 人同时刷接口
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
