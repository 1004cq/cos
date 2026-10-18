import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateKey } from '@/lib/cos';
import { initMultipartUpload } from '@/lib/cos-multipart';
import {
  MULTIPART_PART_SIZE,
  MULTIPART_THRESHOLD,
  isAllowedUploadMime,
  resolveUploadContentType,
} from '@/lib/media-type';

/** 初始化 COS 分片上传（>100MB） */
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

    const contentType = resolveUploadContentType(filename, body.contentType);
    if (!isAllowedUploadMime(contentType)) {
      return NextResponse.json(
        { error: `不支持的类型: ${contentType}` },
        { status: 400 }
      );
    }

    if (size == null || typeof size !== 'number' || size <= 0) {
      return NextResponse.json({ error: '缺少有效 size' }, { status: 400 });
    }
    if (size > 20 * 1024 * 1024 * 1024) {
      return NextResponse.json({ error: '文件过大（上限 20GB）' }, { status: 400 });
    }
    if (size < MULTIPART_THRESHOLD) {
      return NextResponse.json(
        { error: `小于 ${MULTIPART_THRESHOLD} 字节请使用单次 PUT /api/upload/presign` },
        { status: 400 }
      );
    }

    const key = generateKey(filename);
    if (!key.startsWith('media/')) {
      return NextResponse.json({ error: '非法的上传路径' }, { status: 400 });
    }

    const { uploadId, viaSts } = await initMultipartUpload(key, contentType);
    const partCount = Math.ceil(size / MULTIPART_PART_SIZE);

    return NextResponse.json({
      key,
      uploadId,
      contentType,
      viaSts,
      partSize: MULTIPART_PART_SIZE,
      partCount,
      threshold: MULTIPART_THRESHOLD,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '初始化分片失败';
    console.error('multipart init error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
