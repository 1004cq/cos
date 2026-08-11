/**
 * cover-src 等按 IP 限流（进程内 Map，单机 Docker 可靠）
 */

import { getClientIp } from '@/lib/login-rate-limit';

const WINDOW_MS = 60_000;
/** 每分钟每 IP 最大请求数（Range 分片也计数） */
const MAX_PER_WINDOW = 60;

type Bucket = { timestamps: number[] };
const store = new Map<string, Bucket>();

export { getClientIp };

export function checkIpRateLimit(
  ip: string,
  max = MAX_PER_WINDOW,
  windowMs = WINDOW_MS
): { ok: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const entry = store.get(ip) || { timestamps: [] };
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
  if (entry.timestamps.length >= max) {
    store.set(ip, entry);
    const oldest = entry.timestamps[0] || now;
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }
  entry.timestamps.push(now);
  store.set(ip, entry);
  return { ok: true };
}

export const COVER_SRC_RATE_LIMIT = {
  windowMs: WINDOW_MS,
  maxPerWindow: MAX_PER_WINDOW,
} as const;
