import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import { hash } from 'bcryptjs';

/**
 * 创建分享链接
 * Body:
 *   albumId?   - 分享整个相册
 *   mediaIds?  - 分享指定媒体
 *   password?  - 访问密码（可选）
 *   expiresIn? - 有效秒数，默认 7 天，0 表示永久
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const { albumId, mediaIds, password, expiresIn = 7 * 24 * 3600 } = body;

    if (!albumId && (!mediaIds || mediaIds.length === 0)) {
      return NextResponse.json({ error: '必须指定 albumId 或 mediaIds' }, { status: 400 });
    }

    const token = randomBytes(24).toString('hex');
    let hashedPassword: string | null = null;

    if (password && typeof password === 'string' && password.length > 0) {
      hashedPassword = await hash(password, 10);
    }

    const expiresAt =
      expiresIn && expiresIn > 0
        ? new Date(Date.now() + expiresIn * 1000)
        : null;

    const share = await prisma.shareLink.create({
      data: {
        token,
        albumId: albumId || null,
        mediaIds: mediaIds || [],
        password: hashedPassword,
        expiresAt,
      },
    });

    return NextResponse.json({
      id: share.id,
      token: share.token,
      url: `/share/${share.token}`,
      expiresAt: share.expiresAt,
      hasPassword: Boolean(hashedPassword),
    });
  } catch (error: any) {
    console.error('create share error:', error);
    return NextResponse.json({ error: error.message || '创建分享失败' }, { status: 500 });
  }
}