import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * 媒体列表
 * Query:
 *   page, pageSize
 *   albumId
 *   search  (文件名模糊)
 *   tag
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '24', 10)));
    const albumId = searchParams.get('albumId');
    const search = searchParams.get('search');
    const tag = searchParams.get('tag');

    const where: any = {};

    if (albumId) {
      where.albumId = albumId;
    }

    if (search) {
      where.filename = { contains: search, mode: 'insensitive' };
    }

    if (tag) {
      where.tags = { has: tag };
    }

    const [total, items] = await Promise.all([
      prisma.media.count({ where }),
      prisma.media.findMany({
        where,
        orderBy: [{ takenAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          album: { select: { id: true, title: true } },
        },
      }),
    ]);

    return NextResponse.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error: any) {
    console.error('list media error:', error);
    return NextResponse.json({ error: error.message || '获取失败' }, { status: 500 });
  }
}