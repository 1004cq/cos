import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateKey } from '@/lib/cos';
import { isAllowedUploadMime, resolveUploadContentType } from '@/lib/media-type';
import { normalizeMediaTitle } from '@/lib/utils';
import {
  MAX_UPLOAD_BYTES,
  assertSafeMediaKey,
  writeLocalMediaFile,
} from '@/lib/storage';
import { Readable } from 'stream';

export const runtime = 'nodejs';
/** 大文件本地上传（与 COS 2GB 上限对齐；需反向代理放宽 body） */
export const maxDuration = 600;

/**
 * 本地磁盘上传（需登录）
 * multipart fields: file（必填）, title?, albumId?
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: '缺少 file' }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `文件过大（当前单次上传上限 ${MAX_UPLOAD_BYTES / (1024 * 1024 * 1024)}GB）` },
        { status: 400 }
      );
    }

    const filename = file.name || 'upload.bin';
    const mimeType = resolveUploadContentType(filename, file.type);
    if (!isAllowedUploadMime(mimeType)) {
      return NextResponse.json({ error: `不支持的类型: ${mimeType}` }, { status: 400 });
    }

    let title: string | null = null;
    if (form.has('title')) {
      try {
        title = normalizeMediaTitle(String(form.get('title') ?? ''));
      } catch (e: unknown) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : '标题无效' },
          { status: 400 }
        );
      }
    }

    const albumIdRaw = form.get('albumId');
    let albumId: string | null = null;
    if (typeof albumIdRaw === 'string' && albumIdRaw.trim()) {
      const album = await prisma.album.findUnique({ where: { id: albumIdRaw.trim() } });
      if (!album) {
        return NextResponse.json({ error: '相册不存在' }, { status: 400 });
      }
      albumId = album.id;
    }

    const key = assertSafeMediaKey(generateKey(filename));
    const buf = Buffer.from(await file.arrayBuffer());
    const written = await writeLocalMediaFile(key, buf);

    const media = await prisma.media.create({
      data: {
        storage: 'local',
        key,
        filename,
        title,
        mimeType,
        size: written.size,
        albumId,
      },
    });

    return NextResponse.json({
      ...media,
      clientSize: file.size,
      localSize: written.size,
      sizeMismatch: written.size !== file.size,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '本地上传失败';
    console.error('local upload error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// silence unused Readable import if tree-shaken oddly
void Readable;
