import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { compare } from 'bcryptjs';
import { getSignedUrl } from '@/lib/cos';

type Params = { params: Promise<{ token: string }> };

/**
 * 获取分享内容
 * - 无密码：直接返回媒体列表 + 签名 URL
 * - 有密码：需在 body/query 中传 password
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { token } = await params;
    const { searchParams } = new URL(req.url);
    const password = searchParams.get('password') || '';

    const share = await prisma.shareLink.findUnique({ where: { token } });

    if (!share) {
      return NextResponse.json({ error: '分享不存在或已失效' }, { status: 404 });
    }

    if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: '分享已过期' }, { status: 410 });
    }

    // 需要密码
    if (share.password) {
      if (!password) {
        return NextResponse.json(
          { needPassword: true, error: '需要密码' },
          { status: 401 }
        );
      }
      const ok = await compare(password, share.password);
      if (!ok) {
        return NextResponse.json({ error: '密码错误' }, { status: 403 });
      }
    }

    // 拉取媒体
    let mediaList: any[] = [];

    if (share.albumId) {
      const album = await prisma.album.findUnique({
        where: { id: share.albumId },
        include: {
          media: {
            orderBy: [{ takenAt: 'desc' }, { createdAt: 'desc' }],
          },
        },
      });
      if (album) {
        mediaList = album.media;
      }
    } else if (share.mediaIds.length > 0) {
      mediaList = await prisma.media.findMany({
        where: { id: { in: share.mediaIds } },
        orderBy: [{ takenAt: 'desc' }, { createdAt: 'desc' }],
      });
    }

    // 为每个媒体生成短时签名 URL（15 分钟）
    const items = await Promise.all(
      mediaList.map(async (m) => {
        const url = await getSignedUrl(m.key, 900);
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
        };
      })
    );

    return NextResponse.json({
      needPassword: false,
      expiresAt: share.expiresAt,
      items,
    });
  } catch (error: any) {
    console.error('share access error:', error);
    return NextResponse.json({ error: error.message || '获取失败' }, { status: 500 });
  }
}

/** POST 方式传密码（更安全，密码不进 URL） */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { token } = await params;
    const body = await req.json().catch(() => ({}));
    const password = body.password || '';

    // 复用 GET 逻辑：构造带 password 的内部请求不方便，直接内联校验
    const share = await prisma.shareLink.findUnique({ where: { token } });

    if (!share) {
      return NextResponse.json({ error: '分享不存在或已失效' }, { status: 404 });
    }

    if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: '分享已过期' }, { status: 410 });
    }

    if (share.password) {
      if (!password) {
        return NextResponse.json({ needPassword: true, error: '需要密码' }, { status: 401 });
      }
      const ok = await compare(password, share.password);
      if (!ok) {
        return NextResponse.json({ error: '密码错误' }, { status: 403 });
      }
    }

    let mediaList: any[] = [];

    if (share.albumId) {
      const album = await prisma.album.findUnique({
        where: { id: share.albumId },
        include: {
          media: { orderBy: [{ takenAt: 'desc' }, { createdAt: 'desc' }] },
        },
      });
      if (album) mediaList = album.media;
    } else if (share.mediaIds.length > 0) {
      mediaList = await prisma.media.findMany({
        where: { id: { in: share.mediaIds } },
        orderBy: [{ takenAt: 'desc' }, { createdAt: 'desc' }],
      });
    }

    const items = await Promise.all(
      mediaList.map(async (m) => {
        const url = await getSignedUrl(m.key, 900);
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
        };
      })
    );

    return NextResponse.json({
      needPassword: false,
      expiresAt: share.expiresAt,
      items,
    });
  } catch (error: any) {
    console.error('share access post error:', error);
    return NextResponse.json({ error: error.message || '获取失败' }, { status: 500 });
  }
}