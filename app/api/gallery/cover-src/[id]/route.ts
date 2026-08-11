import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getObjectBytes, getSignedUrl } from '@/lib/cos';
import { checkIpRateLimit, getClientIp } from '@/lib/ip-rate-limit';

type Params = { params: Promise<{ id: string }> };

/**
 * 同源视频兜底（仅无 poster 时的临时 Range 首帧）。
 * 有海报 → 302 到签名海报；无 Range → 400（禁止经 Node 整文件中转）。
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ip = getClientIp(req.headers);
    const limited = checkIpRateLimit(ip, 40, 60_000);
    if (!limited.ok) {
      return NextResponse.json(
        { error: '请求过于频繁' },
        {
          status: 429,
          headers: { 'Retry-After': String(limited.retryAfterSec || 60) },
        }
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

    if (media.posterKey && media.posterKey.startsWith('media/')) {
      try {
        const posterUrl = await getSignedUrl(media.posterKey, 900, { thumb: true });
        return NextResponse.redirect(posterUrl, 302);
      } catch {
        /* fall through */
      }
    }

    const range = req.headers.get('range');
    if (!range) {
      return NextResponse.json(
        { error: '请使用 Range 请求；完整视频请走 COS 签名 URL' },
        { status: 400 }
      );
    }

    // 限制单次 Range 大小，防止一次拉整文件
    const m = /^bytes=(\d+)-(\d+)?$/i.exec(range.trim());
    if (m) {
      const start = parseInt(m[1]!, 10);
      const end = m[2] != null ? parseInt(m[2], 10) : start + 1024 * 1024 - 1;
      if (Number.isFinite(start) && Number.isFinite(end) && end - start > 2 * 1024 * 1024) {
        return NextResponse.json(
          { error: 'Range 过大（封面最多约 2MB）' },
          { status: 416 }
        );
      }
    }

    const obj = await getObjectBytes(media.key, { Range: range });
    const resHeaders = new Headers();
    resHeaders.set('Content-Type', obj.contentType || media.mimeType || 'video/mp4');
    resHeaders.set('Cache-Control', 'private, max-age=120');
    resHeaders.set('Accept-Ranges', obj.acceptRanges || 'bytes');
    if (obj.contentLength) resHeaders.set('Content-Length', obj.contentLength);
    if (obj.contentRange) resHeaders.set('Content-Range', obj.contentRange);
    return new NextResponse(new Uint8Array(obj.body), {
      status: obj.contentRange ? 206 : obj.statusCode || 200,
      headers: resHeaders,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '封面源读取失败';
    console.error('cover-src error:', error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
