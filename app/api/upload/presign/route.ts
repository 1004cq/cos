import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateKey, getUploadPresignedUrl } from '@/lib/cos';
import { isAllowedUploadMime, resolveUploadContentType } from '@/lib/media-type';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const { filename, size } = body as {
      filename?: string;
      contentType?: string;
      size?: number;
    };

    if (!filename || typeof filename !== 'string') {
      return NextResponse.json({ error: '缺少 filename' }, { status: 400 });
    }

    // 与前端 PUT 使用同一套解析，保证 Content-Type 一致（含 .mov 空 type → video/quicktime）
    const contentType = resolveUploadContentType(filename, body.contentType);

    if (!isAllowedUploadMime(contentType)) {
      return NextResponse.json(
        { error: `不支持的类型: ${contentType}（仅允许图片/视频原文件）` },
        { status: 400 }
      );
    }

    // 简单限制：最大 2GB（单 PUT；更大文件后续可加 multipart，仍按原字节无损）
    if (size != null && typeof size === 'number' && size > 2 * 1024 * 1024 * 1024) {
      return NextResponse.json({ error: '文件过大（当前单次 PUT 上限 2GB）' }, { status: 400 });
    }

    const key = generateKey(filename);
    if (!key.startsWith('media/')) {
      return NextResponse.json({ error: '非法的上传路径' }, { status: 400 });
    }

    const { url, viaSts } = await getUploadPresignedUrl(key, contentType, 600);

    return NextResponse.json({
      url,
      key,
      contentType,
      viaSts,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '生成预签名失败';
    console.error('presign error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
