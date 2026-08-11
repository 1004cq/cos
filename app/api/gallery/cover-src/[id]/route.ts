import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import { prisma } from '@/lib/prisma';
import { getObjectBytes, getObjectStreamAsync } from '@/lib/cos';

type Params = { params: Promise<{ id: string }> };

/** 简单内存限流：每 IP 每分钟最多 N 次完整代理（防 20 人打满带宽） */
const hits = new Map<string, { n: number; reset: number }>();
const LIMIT = 30;
const WINDOW_MS = 60_000;

function allowIp(ip: string): boolean {
  const now = Date.now();
  const row = hits.get(ip);
  if (!row || now > row.reset) {
    hits.set(ip, { n: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (row.n >= LIMIT) return false;
  row.n += 1;
  return true;
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * 同源视频（图库封面首帧用，仅无 poster 时降级）。
 * 有 posterKey 的视频不应依赖此接口。
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ip = clientIp(req);
    if (!allowIp(ip)) {
      return NextResponse.json(
        { error: '请求过于频繁，请稍后（封面请使用已生成的海报）' },
        { status: 429 }
      );
    }

    const { id } = await params;
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: '无效 id' }, { status: 400 });
    }

    const media = await prisma.media.findUnique({
      where: { id },
      select: { id: true, key: true, mimeType: true, posterKey: true },
    });

    if (!media || !media.key.startsWith('media/')) {
      return NextResponse.json({ error: '不存在' }, { status: 404 });
    }
    if (!media.mimeType.startsWith('video/')) {
      return NextResponse.json({ error: '非视频' }, { status: 400 });
    }

    // 已有海报：列表/条应使用 posterUrl，禁止经 Node 再拉视频
    if (media.posterKey && media.posterKey.startsWith('media/')) {
      return NextResponse.json(
        { error: '已有海报，请使用 posterUrl，勿经 cover-src 拉视频' },
        { status: 409 }
      );
    }

    const range = req.headers.get('range') || undefined;

    if (range) {
      const obj = await getObjectBytes(media.key, { Range: range });
      const resHeaders = new Headers();
      resHeaders.set('Content-Type', obj.contentType || media.mimeType || 'video/mp4');
      resHeaders.set('Cache-Control', 'private, max-age=300');
      resHeaders.set('Accept-Ranges', obj.acceptRanges || 'bytes');
      if (obj.contentLength) resHeaders.set('Content-Length', obj.contentLength);
      if (obj.contentRange) resHeaders.set('Content-Range', obj.contentRange);
      return new NextResponse(new Uint8Array(obj.body), {
        status: obj.contentRange ? 206 : obj.statusCode || 200,
        headers: resHeaders,
      });
    }

    // 无 Range 时只读前 2MB，避免把整段视频经服务器转给 20 个用户
    const obj = await getObjectBytes(media.key, { Range: 'bytes=0-2097151' });
    const resHeaders = new Headers();
    resHeaders.set('Content-Type', obj.contentType || media.mimeType || 'video/mp4');
    resHeaders.set('Cache-Control', 'private, max-age=300');
    resHeaders.set('Accept-Ranges', 'bytes');
    if (obj.contentLength) resHeaders.set('Content-Length', obj.contentLength);
    if (obj.contentRange) resHeaders.set('Content-Range', obj.contentRange);
    return new NextResponse(new Uint8Array(obj.body), {
      status: 206,
      headers: resHeaders,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '封面源读取失败';
    console.error('cover-src error:', error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
