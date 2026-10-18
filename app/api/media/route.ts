import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { publicApiError } from '@/lib/api-error';
import { prisma } from '@/lib/prisma';
import { getStorageProvider, headObjectSize } from '@/lib/storage';
import { isAllowedUploadMime, resolveUploadContentType } from '@/lib/media-type';
import { normalizeMediaTitle } from '@/lib/utils';
<<<<<<< HEAD
import { generateAndStoreImagePoster } from '@/lib/image-poster-server';
=======
import { consumeUploadKey, hasUploadKey } from '@/lib/upload-key-cache';
>>>>>>> origin/main
import { generateAndStoreVideoPoster } from '@/lib/video-poster-server';

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

    // 必须是本进程近期预签名签发的 key（防任意 media/* 冒名入库）
    if (!hasUploadKey(key)) {
      return NextResponse.json(
        { error: '上传凭证无效或已过期，请重新选择文件上传' },
        { status: 400 }
      );
    }

    let resolvedPosterKey: string | null = null;
    if (posterKey != null && posterKey !== '') {
      if (typeof posterKey !== 'string' || !posterKey.startsWith('media/')) {
        return NextResponse.json({ error: '非法的海报对象键' }, { status: 400 });
      }
      // 客户端海报也应来自预签名；服务端 CI 截帧生成的 key 不在缓存中，入库后再写
      if (!hasUploadKey(posterKey)) {
        return NextResponse.json(
          { error: '海报上传凭证无效或已过期' },
          { status: 400 }
        );
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

    // 视频无客户端海报时：服务端 CI 截帧（短超时；失败仍入库，posterKey 为空）
    // 图片且厂商无 imageProcess：用 sharp 生成小封面，供列表用（避免签原图铺网格）
    let posterSource: 'client' | 'ci' | 'image' | 'skipped' | null = resolvedPosterKey
      ? 'client'
      : null;
    if (!resolvedPosterKey && mimeType.startsWith('video/')) {
      const generated = await generateAndStoreVideoPoster(key, {
        time: 1,
        timeoutMs: 12_000,
      });
      if (generated) {
        resolvedPosterKey = generated;
        posterSource = 'ci';
      } else {
        posterSource = 'skipped';
      }
    } else if (!resolvedPosterKey && mimeType.startsWith('image/')) {
      const provider = await getStorageProvider();
      if (!provider.capabilities.imageProcess) {
        const generated = await generateAndStoreImagePoster(key, {
          maxEdge: 480,
          timeoutMs: 15_000,
        });
        if (generated) {
          resolvedPosterKey = generated;
          posterSource = 'image';
        } else {
          posterSource = 'skipped';
        }
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

    consumeUploadKey(key);
    if (resolvedPosterKey && posterSource === 'client') {
      consumeUploadKey(resolvedPosterKey);
    }

    return NextResponse.json({
      ...media,
      clientSize,
      cosSize,
      sizeMismatch,
      posterSource,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: publicApiError(error, '入库失败', 'create media error') },
      { status: 500 }
    );
  }
}
