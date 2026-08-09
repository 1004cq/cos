import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** 获取相册列表 */
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
      },
    });

    return NextResponse.json(albums);
  } catch (error: any) {
    console.error('list albums error:', error);
    return NextResponse.json({ error: error.message || '获取失败' }, { status: 500 });
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

    const album = await prisma.album.create({
      data: {
        title: title.trim(),
        description: description || null,
        isPublic: Boolean(isPublic),
        coverKey: coverKey || null,
      },
    });

    return NextResponse.json(album, { status: 201 });
  } catch (error: any) {
    console.error('create album error:', error);
    return NextResponse.json({ error: error.message || '创建失败' }, { status: 500 });
  }
}