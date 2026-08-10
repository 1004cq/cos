import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getMediaAccessUrls } from '@/lib/media-url';

/**
 * 媒体访问 URL（需登录）
 * Query:
 *   key | id  - 二选一
 *   expires   - 默认 1800
 *   thumb     - 1 时优先返回 thumbUrl（若有）
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key');
    const id = searchParams.get('id');
    const expiresParam = searchParams.get('expires');
    const thumbParam = searchParams.get('thumb');

    if (!key && !id) {
      return NextResponse.json({ error: '缺少 key 或 id' }, { status: 400 });
    }

    const media = id
      ? await prisma.media.findUnique({ where: { id } })
      : await prisma.media.findUnique({ where: { key: key! } });

    if (!media) {
      return NextResponse.json({ error: '媒体不存在' }, { status: 404 });
    }

    if (key && !media.key.startsWith('media/')) {
      return NextResponse.json({ error: '非法的对象键' }, { status: 403 });
    }

    let expires = 1800;
    if (expiresParam) {
      const n = parseInt(expiresParam, 10);
      if (!isNaN(n) && n > 0 && n <= 3600) {
        expires = n;
      }
    }

    const wantThumb =
      thumbParam === '1' || thumbParam === 'true' || thumbParam === 'yes';

    const access = await getMediaAccessUrls(media, expires);
    const url = wantThumb && access.thumbUrl ? access.thumbUrl : access.url;

    return NextResponse.json({
      url,
      expires,
      expiresAt: Date.now() + expires * 1000,
      thumb: wantThumb,
      storage: access.storage,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '生成签名失败';
    console.error('sign error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
