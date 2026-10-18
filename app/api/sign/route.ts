import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSignedUrl } from '@/lib/cos';
import { prisma } from '@/lib/prisma';
import { getCosConfig } from '@/lib/settings';

/**
 * 签名访问接口
 * Query:
 *   key      - COS 对象键（必填，须 media/ 且库中存在）
 *   expires  - 有效期秒数，默认 1800，最大 3600
 *   thumb    - 1/true 缩略（管理端列表）
 *
 * 公开图库灯箱可无登录按需签原图（与 /api/gallery 一致，存在即签）。
 * 未登录时应用图库水印/全图样式；管理端登录不加展示水印。
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

    // 库中存在即可签（公开图库灯箱）；缩略签名建议登录（管理端）
    const wantThumb =
      thumbParam === '1' || thumbParam === 'true' || thumbParam === 'yes';
    if (wantThumb && !session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    let expires = 1800;
    if (expiresParam) {
      const n = parseInt(expiresParam, 10);
      if (!isNaN(n) && n > 0 && n <= 3600) {
        expires = n;
      }
    }

    const isImage = media.mimeType.startsWith('image/');
    const isVideo = media.mimeType.startsWith('video/');

    let signOpts: Parameters<typeof getSignedUrl>[2];
    if (wantThumb) {
      signOpts = {
        thumb: isImage,
        snapshot: isVideo,
      };
    } else if (!session && isImage) {
      const cfg = await getCosConfig();
      const styleFull = (cfg.imageStyleFull || '').trim();
      const wm = Boolean(cfg.watermarkEnabled);
      signOpts = styleFull
        ? { style: styleFull }
        : wm
          ? { watermark: true }
          : undefined;
    } else {
      signOpts = undefined;
    }

    const url = await getSignedUrl(key, expires, signOpts);

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
