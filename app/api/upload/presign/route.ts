import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateKey, getUploadPresignedUrl } from '@/lib/cos';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const { filename, contentType, size } = body;

    if (!filename || !contentType) {
      return NextResponse.json({ error: '缺少 filename 或 contentType' }, { status: 400 });
    }

    // 简单限制：最大 2GB
    if (size && size > 2 * 1024 * 1024 * 1024) {
      return NextResponse.json({ error: '文件过大' }, { status: 400 });
    }

    const key = generateKey(filename);
    const { url } = await getUploadPresignedUrl(key, contentType, 600);

    return NextResponse.json({
      url,
      key,
    });
  } catch (error: any) {
    console.error('presign error:', error);
    return NextResponse.json({ error: error.message || '生成预签名失败' }, { status: 500 });
  }
}