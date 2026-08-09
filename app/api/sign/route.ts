import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSignedUrl } from '@/lib/cos';
import { prisma } from '@/lib/prisma';

/**
 * 强制签名访问接口
 * 所有图片/视频展示必须走这里，禁止前端直接拼 COS 链接
 *
 * Query:
 *   key      - COS 对象键（必填）
 *   expires  - 有效期秒数，默认 1800（30分钟），最大 3600
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key');
    const expiresParam = searchParams.get('expires');

    if (!key) {
      return NextResponse.json({ error: '缺少 key 参数' }, { status: 400 });
    }

    // 安全：只允许访问 media/ 前缀，防止越权访问其他目录
    if (!key.startsWith('media/')) {
      return NextResponse.json({ error: '非法的对象键' }, { status: 403 });
    }

    // 校验媒体是否存在于数据库（可选但推荐）
    const media = await prisma.media.findUnique({ where: { key } });
    if (!media) {
      return NextResponse.json({ error: '媒体不存在' }, { status: 404 });
    }

    // 权限：已登录管理员 或 后续可扩展分享 token
    // 当前 Phase：要求登录。分享场景在 Phase 3 扩展
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    let expires = 1800; // 默认 30 分钟
    if (expiresParam) {
      const n = parseInt(expiresParam, 10);
      if (!isNaN(n) && n > 0 && n <= 3600) {
        expires = n;
      }
    }

    const url = await getSignedUrl(key, expires);

    return NextResponse.json({
      url,
      expires,
      expiresAt: Date.now() + expires * 1000,
    });
  } catch (error: any) {
    console.error('sign error:', error);
    return NextResponse.json({ error: error.message || '生成签名失败' }, { status: 500 });
  }
}