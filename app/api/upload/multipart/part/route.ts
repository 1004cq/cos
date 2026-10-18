import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getMultipartPartPresignedUrl } from '@/lib/cos-multipart';

/** 为指定分片生成 PUT 预签名 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const { key, uploadId, partNumber } = body as {
      key?: string;
      uploadId?: string;
      partNumber?: number;
    };

    if (!key || typeof key !== 'string' || !key.startsWith('media/')) {
      return NextResponse.json({ error: '非法的对象键' }, { status: 400 });
    }
    if (!uploadId || typeof uploadId !== 'string') {
      return NextResponse.json({ error: '缺少 uploadId' }, { status: 400 });
    }
    const pn = Number(partNumber);
    if (!Number.isFinite(pn) || pn < 1 || pn > 10_000) {
      return NextResponse.json({ error: '无效 partNumber' }, { status: 400 });
    }

    const { url, viaSts } = await getMultipartPartPresignedUrl(key, uploadId, pn, 600);

    return NextResponse.json({
      url,
      key,
      uploadId,
      partNumber: pn,
      viaSts,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '分片预签名失败';
    console.error('multipart part error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
