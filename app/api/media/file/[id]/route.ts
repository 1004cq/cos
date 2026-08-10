import { NextRequest, NextResponse } from 'next/server';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { Readable } from 'stream';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { verifyMediaFileToken } from '@/lib/media-token';
import { normalizeStorage, resolveLocalMediaPath } from '@/lib/storage';

type Params = { params: Promise<{ id: string }> };

function parseRange(rangeHeader: string, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!m) return null;
  const startStr = m[1];
  const endStr = m[2];
  let start = startStr ? parseInt(startStr, 10) : NaN;
  let end = endStr ? parseInt(endStr, 10) : NaN;
  if (!Number.isFinite(start) && Number.isFinite(end)) {
    start = Math.max(0, size - end);
    end = size - 1;
  } else {
    if (!Number.isFinite(start)) start = 0;
    if (!Number.isFinite(end) || end >= size) end = size - 1;
  }
  if (start < 0 || end < start || start >= size) return null;
  return { start, end };
}

function toWebStream(nodeStream: ReturnType<typeof createReadStream>): ReadableStream {
  return Readable.toWeb(nodeStream) as unknown as ReadableStream;
}

/**
 * 本地媒体访问（HMAC token 或已登录）
 * 支持 Range → 206，供视频拖动进度
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const token = new URL(req.url).searchParams.get('t') || '';
    const session = await getServerSession(authOptions);
    const tokenOk = verifyMediaFileToken(id, token);

    if (!session && !tokenOk) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const media = await prisma.media.findUnique({ where: { id } });
    if (!media) {
      return NextResponse.json({ error: '媒体不存在' }, { status: 404 });
    }

    const storage = normalizeStorage(media.storage, 'cos');
    if (storage !== 'local') {
      return NextResponse.json({ error: '非本地媒体' }, { status: 400 });
    }

    let fullPath: string;
    try {
      fullPath = resolveLocalMediaPath(media.key);
    } catch {
      return NextResponse.json({ error: '非法路径' }, { status: 403 });
    }

    let st;
    try {
      st = await stat(fullPath);
    } catch {
      return NextResponse.json({ error: '文件不存在' }, { status: 404 });
    }

    const size = st.size;
    const mimeType = media.mimeType || 'application/octet-stream';
    const rangeHeader = req.headers.get('range');

    const commonHeaders: Record<string, string> = {
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=600',
      'X-Content-Type-Options': 'nosniff',
    };

    if (rangeHeader) {
      const range = parseRange(rangeHeader, size);
      if (!range) {
        return new NextResponse(null, {
          status: 416,
          headers: { ...commonHeaders, 'Content-Range': `bytes */${size}` },
        });
      }
      const { start, end } = range;
      const chunkSize = end - start + 1;
      const stream = createReadStream(fullPath, { start, end });
      return new NextResponse(toWebStream(stream), {
        status: 206,
        headers: {
          ...commonHeaders,
          'Content-Length': String(chunkSize),
          'Content-Range': `bytes ${start}-${end}/${size}`,
        },
      });
    }

    const stream = createReadStream(fullPath);
    return new NextResponse(toWebStream(stream), {
      status: 200,
      headers: {
        ...commonHeaders,
        'Content-Length': String(size),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '读取失败';
    console.error('media file error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
