import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateAndStoreVideoPoster } from '@/lib/cos';

/**
 * 批量补全无封面视频的 posterKey（数据万象 CI snapshot）。
 * Body: { limit?: number }  默认 20，最大 50
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    let limit = 20;
    try {
      const body = await req.json().catch(() => ({}));
      if (body && typeof body.limit === 'number' && Number.isFinite(body.limit)) {
        limit = Math.min(50, Math.max(1, Math.floor(body.limit)));
      }
    } catch {
      /* empty body ok */
    }

    const videos = await prisma.media.findMany({
      where: {
        mimeType: { startsWith: 'video/' },
        key: { startsWith: 'media/' },
        OR: [{ posterKey: null }, { posterKey: '' }],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, key: true, filename: true },
    });

    const results: {
      id: string;
      filename: string;
      ok: boolean;
      posterKey?: string;
      error?: string;
    }[] = [];

    for (const v of videos) {
      try {
        const posterKey = await generateAndStoreVideoPoster(v.key);
        if (!posterKey) {
          results.push({
            id: v.id,
            filename: v.filename,
            ok: false,
            error: 'CI snapshot 失败或未开通数据万象',
          });
          continue;
        }
        await prisma.media.update({
          where: { id: v.id },
          data: { posterKey },
        });
        results.push({ id: v.id, filename: v.filename, ok: true, posterKey });
      } catch (err: unknown) {
        results.push({
          id: v.id,
          filename: v.filename,
          ok: false,
          error: err instanceof Error ? err.message : '失败',
        });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    return NextResponse.json({
      success: true,
      attempted: results.length,
      ok: okCount,
      failed: results.length - okCount,
      results,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '补全失败';
    console.error('backfill-posters error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
