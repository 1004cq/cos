import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { deleteObject } from '@/lib/cos';
import { normalizeMediaTitle } from '@/lib/utils';
import { deleteLocalMediaFile, normalizeStorage } from '@/lib/storage';

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
 * Body: { albumId?: string | null, title?: string | null }
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const data: { albumId?: string | null; title?: string | null } = {};

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
 * Query: deleteFile=1 或 deleteFromCos=1 时同步删除对应存储上的文件
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;
    const qs = new URL(req.url).searchParams;
    const deleteFile = qs.get('deleteFile') === '1' || qs.get('deleteFromCos') === '1';

    const media = await prisma.media.findUnique({ where: { id } });
    if (!media) {
      return NextResponse.json({ error: '媒体不存在' }, { status: 404 });
    }

    const storage = normalizeStorage(media.storage, 'cos');

    if (deleteFile) {
      try {
        if (storage === 'cos') {
          await deleteObject(media.key);
        } else {
          await deleteLocalMediaFile(media.key);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '存储删除失败';
        console.error('delete storage object error:', err);
        return NextResponse.json(
          { error: `存储删除失败，已中止：${msg}`, fileDeleted: false },
          { status: 502 }
        );
      }
    }

    await prisma.media.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      storage,
      fileDeleted: deleteFile,
      cosDeleted: deleteFile && storage === 'cos',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '删除失败';
    console.error('delete media error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
