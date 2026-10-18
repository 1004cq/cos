import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  abortMultipartUpload,
  completeMultipartUpload,
  type MultipartPart,
} from '@/lib/cos-multipart';

/** 完成分片上传（或 abort=true 时中止） */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const { key, uploadId, parts, abort } = body as {
      key?: string;
      uploadId?: string;
      parts?: MultipartPart[];
      abort?: boolean;
    };

    if (!key || typeof key !== 'string' || !key.startsWith('media/')) {
      return NextResponse.json({ error: '非法的对象键' }, { status: 400 });
    }
    if (!uploadId || typeof uploadId !== 'string') {
      return NextResponse.json({ error: '缺少 uploadId' }, { status: 400 });
    }

    if (abort) {
      await abortMultipartUpload(key, uploadId);
      return NextResponse.json({ ok: true, aborted: true });
    }

    await completeMultipartUpload(key, uploadId, parts || []);
    return NextResponse.json({ ok: true, key, uploadId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '完成分片失败';
    console.error('multipart complete error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
