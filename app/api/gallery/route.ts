import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSignedUrl } from '@/lib/cos';

/**
 * 公开主页图库：无需登录
 * Query:
 *   pageSize  默认 60，最大 100
 *   type      image | video | all（默认 all）
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '60', 10)));
    const type = searchParams.get('type') || 'all';

    const where =
      type === 'image'
        ? { mimeType: { startsWith: 'image/' } }
        : type === 'video'
          ? { mimeType: { startsWith: 'video/' } }
          : {};

    const items = await prisma.media.findMany({
      where,
      orderBy: [{ takenAt: 'desc' }, { createdAt: 'desc' }],
      take: pageSize,
      select: {
        id: true,
        key: true,
        filename: true,
        mimeType: true,
        size: true,
        width: true,
        height: true,
        duration: true,
        takenAt: true,
        createdAt: true,
      },
    });

    // 服务端签发，前端无需登录调 /api/sign
    const signed = await Promise.all(
      items.map(async (m) => {
        const isImage = m.mimeType.startsWith('image/');
        const isVideo = m.mimeType.startsWith('video/');
        const [url, thumbUrl] = await Promise.all([
          getSignedUrl(m.key, 1800),
          isImage ? getSignedUrl(m.key, 1800, { thumb: true }) : Promise.resolve(null),
        ]);
        return {
          ...m,
          url,
          thumbUrl: thumbUrl || url,
          kind: isVideo ? 'video' : isImage ? 'image' : 'other',
        };
      })
    );

    const images = signed.filter((x) => x.kind === 'image');
    const videos = signed.filter((x) => x.kind === 'video');

    return NextResponse.json({
      images,
      videos,
      total: signed.length,
      imageCount: images.length,
      videoCount: videos.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '加载失败';
    console.error('gallery error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
