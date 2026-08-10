import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { headObjectSize } from '@/lib/cos';
import { isAllowedUploadMime, resolveUploadContentType } from '@/lib/media-type';
import { normalizeMediaTitle } from '@/lib/utils';
import { getStorageConfig } from '@/lib/settings';
import {
  assertSafeMediaKey,
  isStorageBackend,
  normalizeStorage,
  statLocalMedia,
} from '@/lib/storage';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const { key, filename, size, width, height, duration, albumId, takenAt, tags } = body;

    if (!key || !filename || size == null) {
      return NextResponse.json({ error: '缺少必要字段' }, { status: 400 });
    }

    let safeKey: string;
    try {
      safeKey = assertSafeMediaKey(key);
    } catch (e: unknown) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : '非法的对象键' },
        { status: 400 }
      );
    }

    const storageCfg = await getStorageConfig();
    const storage = isStorageBackend(body.storage)
      ? body.storage
      : normalizeStorage(storageCfg.defaultStorage, 'cos');

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

    let remoteSize: number | null = null;
    if (storage === 'cos') {
      try {
        remoteSize = await headObjectSize(safeKey);
      } catch (err) {
        console.warn('headObject size failed:', safeKey, err);
      }
    } else {
      remoteSize = await statLocalMedia(safeKey);
      if (remoteSize == null) {
        return NextResponse.json({ error: '本地文件不存在，请先上传' }, { status: 400 });
      }
    }

    const storedSize = remoteSize != null ? remoteSize : clientSize;
    const sizeMismatch = remoteSize != null && remoteSize !== clientSize;

    const media = await prisma.media.create({
      data: {
        storage,
        key: safeKey,
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
      },
    });

    return NextResponse.json({
      ...media,
      clientSize,
      cosSize: storage === 'cos' ? remoteSize : null,
      localSize: storage === 'local' ? remoteSize : null,
      sizeMismatch,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '入库失败';
    console.error('create media error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
