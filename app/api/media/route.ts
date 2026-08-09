import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const { key, filename, mimeType, size, width, height, duration, albumId, takenAt, tags } = body;

    if (!key || !filename || !mimeType || size == null) {
      return NextResponse.json({ error: '缺少必要字段' }, { status: 400 });
    }

    const media = await prisma.media.create({
      data: {
        key,
        filename,
        mimeType,
        size,
        width: width || null,
        height: height || null,
        duration: duration || null,
        albumId: albumId || null,
        takenAt: takenAt ? new Date(takenAt) : null,
        tags: tags || [],
      },
    });

    return NextResponse.json(media);
  } catch (error: any) {
    console.error('create media error:', error);
    return NextResponse.json({ error: error.message || '入库失败' }, { status: 500 });
  }
}