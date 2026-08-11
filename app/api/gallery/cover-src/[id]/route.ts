import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import { prisma } from '@/lib/prisma';
import { getObjectBytes, getObjectStreamAsync } from '@/lib/cos';

type Params = { params: Promise<{ id: string }> };

/**
 * 同源视频（图库封面首帧用）。
 * 透传 Range，便于 iPhone MOV（moov 在尾部）用 metadata 出首帧；
 * 绕过 COS 防盗链与浏览器 CORS。
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: '无效 id' }, { status: 400 });
    }

    const media = await prisma.media.findUnique({
      where: { id },
      select: { id: true, key: true, mimeType: true },
    });

    if (!media || !media.key.startsWith('media/')) {
      return NextResponse.json({ error: '不存在' }, { status: 404 });
    }
    if (!media.mimeType.startsWith('video/')) {
      return NextResponse.json({ error: '非视频' }, { status: 400 });
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

    const nodeStream = await getObjectStreamAsync(media.key);
    nodeStream.on('error', (err) => {
      console.error('cover-src stream error:', media.key, err);
    });
    const webStream = Readable.toWeb(nodeStream as Readable) as unknown as ReadableStream;
    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': media.mimeType || 'video/mp4',
        'Cache-Control': 'private, max-age=300',
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '封面源读取失败';
    console.error('cover-src error:', error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
