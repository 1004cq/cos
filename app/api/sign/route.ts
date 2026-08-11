import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSignedUrl } from '@/lib/cos';
import { prisma } from '@/lib/prisma';

/**
 * 强制签名访问接口（管理端）
 * 所有图片/视频展示必须走这里，禁止前端直接拼 COS 链接
 *
 * Query:
 *   key      - COS 对象键（必填）
 *   expires  - 有效期秒数，默认 1800（30分钟），最大 3600
 *   thumb    - 1/true 时返回数据万象缩略图（列表用）；灯箱请勿传
 *
 * 注意：本接口不加展示水印（管理端原图下载）；公开图库水印由 /api/gallery 控制。
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key');
    const expiresParam = searchParams.get('expires');
    const thumbParam = searchParams.get('thumb');

    if (!key) {
      return NextResponse.json({ error: '缺少 key 参数' }, { status: 400 });
    }

    if (!key.startsWith('media/')) {
      return NextResponse.json({ error: '非法的对象键' }, { status: 403 });
    }

    const media = await prisma.media.findUnique({ where: { key } });
    if (!media) {
      return NextResponse.json({ error: '媒体不存在' }, { status: 404 });
    }

    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
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
    const isImage = media.mimeType.startsWith('image/');
    const isVideo = media.mimeType.startsWith('video/');

    const url = await getSignedUrl(key, expires, {
      thumb: wantThumb && isImage,
      snapshot: wantThumb && isVideo,
    });

    return NextResponse.json({
      url,
      expires,
      expiresAt: Date.now() + expires * 1000,
      thumb: wantThumb && (isImage || isVideo),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '生成签名失败';
    console.error('sign error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
