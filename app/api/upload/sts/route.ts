import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUploadStsCredential, isStsEnabled } from '@/lib/sts';

/**
 * 下发上传用 STS 临时密钥（仅 media/* Put/分片）
 * 前端可用 cos-js-sdk 直传；当前上传页仍优先走 /api/upload/presign（服务端 STS 签 PUT）
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    if (!isStsEnabled()) {
      return NextResponse.json(
        { error: 'STS 未启用', enabled: false },
        { status: 503 }
      );
    }

    const data = await getUploadStsCredential(900);

    return NextResponse.json({
      enabled: true,
      ...data,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '获取 STS 失败';
    console.error('sts error:', error);
    return NextResponse.json({ error: message, enabled: false }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    return NextResponse.json({
      enabled: isStsEnabled(),
      allowPrefix: 'media/*',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
