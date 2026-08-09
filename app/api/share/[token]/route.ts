import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { compare } from 'bcryptjs';
import { getSignedUrl } from '@/lib/cos';

type Params = { params: Promise<{ token: string }> };

type MediaRow = {
  id: string;
  key: string;
  filename: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  takenAt: Date | null;
};

async function loadShareMedia(share: {
  albumId: string | null;
  mediaIds: string[];
}): Promise<MediaRow[]> {
  if (share.albumId) {
    const album = await prisma.album.findUnique({
      where: { id: share.albumId },
      include: {
        media: { orderBy: [{ takenAt: 'desc' }, { createdAt: 'desc' }] },
      },
    });
    return album?.media ?? [];
  }

  if (share.mediaIds.length > 0) {
    return prisma.media.findMany({
      where: { id: { in: share.mediaIds } },
      orderBy: [{ takenAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  return [];
}

async function buildShareItems(mediaList: MediaRow[]) {
  return Promise.all(
    mediaList.map(async (m) => {
      const isImage = m.mimeType.startsWith('image/');
      const [url, thumbUrl] = await Promise.all([
        getSignedUrl(m.key, 900),
        isImage ? getSignedUrl(m.key, 900, { thumb: true }) : Promise.resolve(null),
      ]);

      return {
        id: m.id,
        key: m.key,
        filename: m.filename,
        mimeType: m.mimeType,
        size: m.size,
        width: m.width,
        height: m.height,
        duration: m.duration,
        takenAt: m.takenAt,
        url,
        // 网格用缩略图；灯箱用 url 原图
        thumbUrl: thumbUrl || url,
      };
    })
  );
}

async function resolveShareAccess(token: string, password: string) {
  const share = await prisma.shareLink.findUnique({ where: { token } });

  if (!share) {
    return { error: NextResponse.json({ error: '分享不存在或已失效' }, { status: 404 }) };
  }

  if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
    return { error: NextResponse.json({ error: '分享已过期' }, { status: 410 }) };
  }

  if (share.password) {
    if (!password) {
      return {
        error: NextResponse.json({ needPassword: true, error: '需要密码' }, { status: 401 }),
      };
    }
    const ok = await compare(password, share.password);
    if (!ok) {
      return { error: NextResponse.json({ error: '密码错误' }, { status: 403 }) };
    }
  }

  return { share };
}

/** 删除分享（按 token 或 id，需登录） */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { token } = await params;

    const existing = await prisma.shareLink.findFirst({
      where: {
        OR: [{ token }, { id: token }],
      },
    });

    if (!existing) {
      return NextResponse.json({ error: '分享不存在' }, { status: 404 });
    }

    await prisma.shareLink.delete({ where: { id: existing.id } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '删除失败';
    console.error('delete share error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * 获取分享内容
 * - 无密码：直接返回媒体列表 + 签名 URL
 * - 有密码：需在 body/query 中传 password
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { token } = await params;
    const password = new URL(req.url).searchParams.get('password') || '';
    const resolved = await resolveShareAccess(token, password);
    if ('error' in resolved && resolved.error) return resolved.error;

    const mediaList = await loadShareMedia(resolved.share!);
    const items = await buildShareItems(mediaList);

    return NextResponse.json({
      needPassword: false,
      expiresAt: resolved.share!.expiresAt,
      items,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '获取失败';
    console.error('share access error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST 方式传密码（更安全，密码不进 URL） */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { token } = await params;
    const body = await req.json().catch(() => ({}));
    const password = body.password || '';

    const resolved = await resolveShareAccess(token, password);
    if ('error' in resolved && resolved.error) return resolved.error;

    const mediaList = await loadShareMedia(resolved.share!);
    const items = await buildShareItems(mediaList);

    return NextResponse.json({
      needPassword: false,
      expiresAt: resolved.share!.expiresAt,
      items,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '获取失败';
    console.error('share access post error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
