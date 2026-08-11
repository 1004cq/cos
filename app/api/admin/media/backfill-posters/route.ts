import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateAndStoreVideoPoster } from '@/lib/video-poster-server';

/**
 * POST { limit?: number }
 * 为缺少 posterKey 的视频批量 CI 截帧并写库。
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(50, Math.max(1, Number(body.limit) || 10));

    const list = await prisma.media.findMany({
      where: {
        mimeType: { startsWith: 'video/' },
        key: { startsWith: 'media/' },
        OR: [{ posterKey: null }, { posterKey: '' }],
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: { id: true, key: true, filename: true },
    });

    const results: {
      id: string;
      filename: string;
      ok: boolean;
      posterKey?: string;
      error?: string;
    }[] = [];

    for (const item of list) {
      try {
        // 后台补全可用更长超时；上传入库路径仍为短超时（约 12s）
        const posterKey = await generateAndStoreVideoPoster(item.key, {
          time: 1,
          timeoutMs: 60_000,
        });
        if (!posterKey) {
          results.push({
            id: item.id,
            filename: item.filename,
            ok: false,
            error: '截帧失败（请确认数据万象媒体处理已开通）',
          });
          continue;
        }
        await prisma.media.update({
          where: { id: item.id },
          data: { posterKey },
        });
        results.push({ id: item.id, filename: item.filename, ok: true, posterKey });
      } catch (e: unknown) {
        results.push({
          id: item.id,
          filename: item.filename,
          ok: false,
          error: e instanceof Error ? e.message : '失败',
        });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    return NextResponse.json({
      total: list.length,
      okCount,
      failCount: list.length - okCount,
      results,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '补封面失败';
    console.error('backfill posters error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
