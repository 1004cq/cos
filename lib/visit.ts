import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

/** 从请求头解析真实 IP（兼容反代 / CDN） */
export function getClientIp(req: NextRequest): string {
  const xf = req.headers.get('x-forwarded-for');
  if (xf) {
    const first = xf.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real.slice(0, 64);
  // NextRequest 在部分运行时可能没有 ip 字段
  const anyReq = req as unknown as { ip?: string };
  if (anyReq.ip) return String(anyReq.ip).slice(0, 64);
  return 'unknown';
}

export type RecordVisitInput = {
  req: NextRequest;
  path: string;
  kind?: 'page' | 'share' | 'api';
  shareToken?: string | null;
  method?: string;
};

/** 异步记一笔访问，失败不影响主流程 */
export async function recordVisit(input: RecordVisitInput): Promise<void> {
  try {
    const ip = getClientIp(input.req);
    const userAgent = input.req.headers.get('user-agent')?.slice(0, 512) || null;
    const referer = input.req.headers.get('referer')?.slice(0, 512) || null;

    await prisma.visit.create({
      data: {
        ip,
        path: input.path.slice(0, 512),
        method: (input.method || input.req.method || 'GET').slice(0, 16),
        referer,
        userAgent,
        shareToken: input.shareToken || null,
        kind: input.kind || 'page',
      },
    });
  } catch (e) {
    console.error('recordVisit failed:', e);
  }
}
