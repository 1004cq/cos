import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/client-ip';

export { getClientIp } from '@/lib/client-ip';

export type RecordVisitInput = {
  req: NextRequest;
  path: string;
  kind?: 'page' | 'share' | 'api';
  shareToken?: string | null;
  method?: string;
  /** 同一 IP + path 去重窗口（毫秒），默认 60s；传 0 关闭 */
  dedupeMs?: number;
};

/** 进程内去重：ip|path → 上次写入时间 */
const recentVisitAt = new Map<string, number>();
const DEDUPE_DEFAULT_MS = 60_000;
const DEDUPE_MAP_MAX = 5_000;

function shouldSkipDedupe(ip: string, path: string, dedupeMs: number): boolean {
  if (dedupeMs <= 0) return false;
  const key = `${ip}|${path}`;
  const now = Date.now();
  const prev = recentVisitAt.get(key);
  if (prev != null && now - prev < dedupeMs) return true;
  recentVisitAt.set(key, now);
  if (recentVisitAt.size > DEDUPE_MAP_MAX) {
    // 简单清扫过期项，避免无限增长
    for (const [k, t] of recentVisitAt) {
      if (now - t > dedupeMs) recentVisitAt.delete(k);
    }
    if (recentVisitAt.size > DEDUPE_MAP_MAX) {
      recentVisitAt.clear();
      recentVisitAt.set(key, now);
    }
  }
  return false;
}

/** 异步记一笔访问，失败不影响主流程 */
export async function recordVisit(input: RecordVisitInput): Promise<void> {
  try {
    const ip = getClientIp(input.req);
    const path = input.path.slice(0, 512);
    const dedupeMs = input.dedupeMs ?? DEDUPE_DEFAULT_MS;
    if (shouldSkipDedupe(ip, path, dedupeMs)) return;

    const userAgent = input.req.headers.get('user-agent')?.slice(0, 512) || null;
    const referer = input.req.headers.get('referer')?.slice(0, 512) || null;

    await prisma.visit.create({
      data: {
        ip,
        path,
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
