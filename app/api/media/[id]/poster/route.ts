import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateAndStoreVideoPoster } from '@/lib/video-poster-server';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/media/[id]/poster
 * 登录后为单条视频触发服务端 CI 截帧并写入 posterKey。
 * 上传时客户端截帧失败时调用此接口降级。
 */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;
    const media = await prisma.media.findUnique({
      where: { id },
      select: { id: true, key: true, mimeType: true, posterKey: true },
    });

    if (!media) {
      return NextResponse.json({ error: '媒体不存在' }, { status: 404 });
    }
    if (!media.mimeType.startsWith('video/')) {
      return NextResponse.json({ error: '非视频' }, { status: 400 });
    }
    if (media.posterKey) {
      return NextResponse.json({ posterKey: media.posterKey, skipped: true });
    }

    const posterKey = await generateAndStoreVideoPoster(media.key, { time: 1 });
    if (!posterKey) {
      return NextResponse.json(
        { error: '截帧失败（请确认数据万象媒体处理已开通）' },
        { status: 502 }
      );
    }

    await prisma.media.update({ where: { id }, data: { posterKey } });
    return NextResponse.json({ posterKey });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '生成封面失败';
    console.error('media poster error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
