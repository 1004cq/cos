import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { resolveAlbumCoverKey } from '@/lib/album-cover';

/** 获取相册列表（含展示用封面键 displayCoverKey） */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const albums = await prisma.album.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        _count: { select: { media: true } },
        media: {
          take: 12,
          orderBy: [{ takenAt: 'desc' }, { createdAt: 'desc' }],
          select: { key: true, posterKey: true, mimeType: true },
        },
      },
    });

    const list = albums.map((a) => {
      const { media, ...rest } = a;
      return {
        ...rest,
        displayCoverKey: resolveAlbumCoverKey({
          coverKey: a.coverKey,
          media,
        }),
      };
    });

    return NextResponse.json(list);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '获取失败';
    console.error('list albums error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** 创建相册 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const { title, description, isPublic, coverKey } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: '标题不能为空' }, { status: 400 });
    }

    let resolvedCover: string | null = null;
    if (coverKey != null && coverKey !== '') {
      if (typeof coverKey !== 'string' || !coverKey.startsWith('media/')) {
        return NextResponse.json({ error: 'coverKey 非法' }, { status: 400 });
      }
      resolvedCover = coverKey;
    }

    const album = await prisma.album.create({
      data: {
        title: title.trim(),
        description: description || null,
        isPublic: Boolean(isPublic),
        coverKey: resolvedCover,
      },
    });

    return NextResponse.json(album, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '创建失败';
    console.error('create album error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
