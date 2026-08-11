import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { headObjectSize, generateAndStoreVideoPoster } from '@/lib/cos';
import { isAllowedUploadMime, resolveUploadContentType } from '@/lib/media-type';
import { normalizeMediaTitle } from '@/lib/utils';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const { key, filename, size, width, height, duration, albumId, takenAt, tags, posterKey } =
      body;

    if (!key || !filename || size == null) {
      return NextResponse.json({ error: '缺少必要字段' }, { status: 400 });
    }

    if (typeof key !== 'string' || !key.startsWith('media/')) {
      return NextResponse.json({ error: '非法的对象键' }, { status: 400 });
    }

    let resolvedPosterKey: string | null = null;
    if (posterKey != null && posterKey !== '') {
      if (typeof posterKey !== 'string' || !posterKey.startsWith('media/')) {
        return NextResponse.json({ error: '非法的海报对象键' }, { status: 400 });
      }
      resolvedPosterKey = posterKey;
    }

    const mimeType = resolveUploadContentType(filename, body.mimeType);
    if (!isAllowedUploadMime(mimeType)) {
      return NextResponse.json({ error: `不支持的类型: ${mimeType}` }, { status: 400 });
    }

    let title: string | null = null;
    if ('title' in body) {
      try {
        title = normalizeMediaTitle(body.title);
      } catch (e: unknown) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : '标题无效' },
          { status: 400 }
        );
      }
    }

    const clientSize = typeof size === 'number' ? size : parseInt(String(size), 10);
    if (!Number.isFinite(clientSize) || clientSize < 0) {
      return NextResponse.json({ error: '无效的 size' }, { status: 400 });
    }

    let cosSize: number | null = null;
    try {
      cosSize = await headObjectSize(key);
    } catch (err) {
      console.warn('headObject size failed:', key, err);
    }

    const storedSize = cosSize != null ? cosSize : clientSize;
    const sizeMismatch = cosSize != null && cosSize !== clientSize;

    // 视频无海报：服务端 CI snapshot 写 *-poster.jpg（需开通数据万象）
    let posterFromCi = false;
    if (!resolvedPosterKey && mimeType.startsWith('video/')) {
      const generated = await generateAndStoreVideoPoster(key);
      if (generated) {
        resolvedPosterKey = generated;
        posterFromCi = true;
      }
    }

    const media = await prisma.media.create({
      data: {
        key,
        filename,
        title,
        mimeType,
        size: storedSize,
        width: width || null,
        height: height || null,
        duration: duration || null,
        albumId: albumId || null,
        takenAt: takenAt ? new Date(takenAt) : null,
        tags: tags || [],
        posterKey: resolvedPosterKey,
      },
    });

    return NextResponse.json({
      ...media,
      clientSize,
      cosSize,
      sizeMismatch,
      posterFromCi,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '入库失败';
    console.error('create media error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
