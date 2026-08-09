import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

type Params = { params: Promise<{ id: string }> };

/** 获取单个相册（含媒体） */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;

    const album = await prisma.album.findUnique({
      where: { id },
      include: {
        media: {
          orderBy: [{ takenAt: 'desc' }, { createdAt: 'desc' }],
        },
      },
    });

    if (!album) {
      return NextResponse.json({ error: '相册不存在' }, { status: 404 });
    }

    return NextResponse.json(album);
  } catch (error: any) {
    console.error('get album error:', error);
    return NextResponse.json({ error: error.message || '获取失败' }, { status: 500 });
  }
}

/** 更新相册 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { title, description, isPublic, coverKey, sortOrder } = body;

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = String(title).trim();
    if (description !== undefined) data.description = description;
    if (isPublic !== undefined) data.isPublic = Boolean(isPublic);
    if (coverKey !== undefined) {
      if (coverKey === null || coverKey === '') {
        data.coverKey = null;
      } else if (typeof coverKey === 'string' && coverKey.startsWith('media/')) {
        data.coverKey = coverKey;
      } else {
        return NextResponse.json({ error: 'coverKey 非法' }, { status: 400 });
      }
    }
    if (sortOrder !== undefined) data.sortOrder = Number(sortOrder);

    const album = await prisma.album.update({
      where: { id },
      data,
    });

    return NextResponse.json(album);
  } catch (error: any) {
    console.error('update album error:', error);
    return NextResponse.json({ error: error.message || '更新失败' }, { status: 500 });
  }
}

/** 删除相册（媒体保留，仅解除关联） */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;

    await prisma.album.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('delete album error:', error);
    return NextResponse.json({ error: error.message || '删除失败' }, { status: 500 });
  }
}