import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** 仪表盘统计（需登录） */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const now = new Date();

    const [mediaTotal, albumTotal, shareTotal, sizeAgg, imageCount, videoCount, shareExpired] =
      await Promise.all([
        prisma.media.count(),
        prisma.album.count(),
        prisma.shareLink.count(),
        prisma.media.aggregate({ _sum: { size: true } }),
        prisma.media.count({ where: { mimeType: { startsWith: 'image/' } } }),
        prisma.media.count({ where: { mimeType: { startsWith: 'video/' } } }),
        prisma.shareLink.count({
          where: {
            expiresAt: { lt: now },
          },
        }),
      ]);

    return NextResponse.json({
      mediaTotal,
      albumTotal,
      shareTotal,
      shareActive: shareTotal - shareExpired,
      shareExpired,
      totalBytes: sizeAgg._sum.size ?? 0,
      imageCount,
      videoCount,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '获取统计失败';
    console.error('stats error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
