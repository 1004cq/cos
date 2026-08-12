import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { deleteObject } from '@/lib/cos';
import { normalizeMediaTitle } from '@/lib/utils';

type Params = { params: Promise<{ id: string }> };

/** 获取单条媒体 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;
    const media = await prisma.media.findUnique({
      where: { id },
      include: { album: { select: { id: true, title: true } } },
    });

    if (!media) {
      return NextResponse.json({ error: '媒体不存在' }, { status: 404 });
    }

    return NextResponse.json(media);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '获取失败';
    console.error('get media error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * 更新媒体
 * Body: { albumId?, title?, posterKey?, takenAt? }
 * title / takenAt 传 null 或空字符串可清空
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const data: {
      albumId?: string | null;
      title?: string | null;
      posterKey?: string | null;
      takenAt?: Date | null;
    } = {};

    if ('albumId' in body) {
      if (body.albumId === null || body.albumId === '') {
        data.albumId = null;
      } else if (typeof body.albumId === 'string') {
        const album = await prisma.album.findUnique({ where: { id: body.albumId } });
        if (!album) {
          return NextResponse.json({ error: '相册不存在' }, { status: 400 });
        }
        data.albumId = body.albumId;
      } else {
        return NextResponse.json({ error: 'albumId 无效' }, { status: 400 });
      }
    }

    if ('title' in body) {
      try {
        data.title = normalizeMediaTitle(body.title);
      } catch (e: unknown) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : '标题无效' },
          { status: 400 }
        );
      }
    }

    if ('posterKey' in body) {
      if (body.posterKey === null || body.posterKey === '') {
        data.posterKey = null;
      } else if (typeof body.posterKey === 'string' && body.posterKey.startsWith('media/')) {
        data.posterKey = body.posterKey;
      } else {
        return NextResponse.json({ error: 'posterKey 无效' }, { status: 400 });
      }
    }

    if ('takenAt' in body) {
      if (body.takenAt === null || body.takenAt === '') {
        data.takenAt = null;
      } else if (typeof body.takenAt === 'string' || typeof body.takenAt === 'number') {
        const d = new Date(body.takenAt);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ error: 'takenAt 日期无效' }, { status: 400 });
        }
        data.takenAt = d;
      } else {
        return NextResponse.json({ error: 'takenAt 必须是 ISO 字符串或 null' }, { status: 400 });
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 });
    }

    const media = await prisma.media.update({
      where: { id },
      data,
      include: { album: { select: { id: true, title: true } } },
    });

    return NextResponse.json(media);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '更新失败';
    console.error('update media error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * 删除媒体
 * Query: deleteFromCos=1 时同步删除 COS 对象（可选）
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;
    const deleteFromCos = new URL(req.url).searchParams.get('deleteFromCos') === '1';

    const media = await prisma.media.findUnique({ where: { id } });
    if (!media) {
      return NextResponse.json({ error: '媒体不存在' }, { status: 404 });
    }

    // 先删 COS，失败则不删 DB，避免静默成功留下孤儿状态不清
    if (deleteFromCos) {
      try {
        await deleteObject(media.key);
      } catch (err: unknown) {
        const cosError = err instanceof Error ? err.message : 'COS 删除失败';
        console.error('delete cos object error:', err);
        return NextResponse.json(
          { error: `COS 删除失败，已中止：${cosError}`, cosDeleted: false },
          { status: 502 }
        );
      }
      if (media.posterKey && media.posterKey.startsWith('media/') && media.posterKey !== media.key) {
        try {
          await deleteObject(media.posterKey);
        } catch (err) {
          console.warn('delete poster object failed:', media.posterKey, err);
        }
      }
    }

    await prisma.media.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      cosDeleted: deleteFromCos,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '删除失败';
    console.error('delete media error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
