/**
 * 通用进程内限流（滑动窗口 / 失败锁定）
 *
 * 限制说明：Serverless / 多实例部署时各实例内存不共享，限流为「尽力而为」。
 * 单机 Docker / 长驻 Node 进程下生效可靠。登录限流仍见 login-rate-limit.ts。
 */

import { extractClientIp } from '@/lib/client-ip';

export function getClientIp(
  headers?: Headers | Record<string, string | string[] | undefined>
): string {
  return extractClientIp(headers);
}

type WindowEntry = {
  hits: number[];
};

/** 固定窗口内最多 N 次（用于公开接口吞吐） */
const windowStore = new Map<string, WindowEntry>();

type FailEntry = {
  failures: number[];
  blockedUntil?: number;
};

/** 失败次数锁定（用于密码猜解） */
const failStore = new Map<string, FailEntry>();

function pruneHits(now: number, entry: WindowEntry, windowMs: number) {
  entry.hits = entry.hits.filter((t) => now - t < windowMs);
}

function pruneFails(now: number, entry: FailEntry, windowMs: number) {
  entry.failures = entry.failures.filter((t) => now - t < windowMs);
}

/**
 * 滑动窗口限流：同一 key 在 windowMs 内最多 limit 次。
 * 每次调用计一次命中（通过才计入）。
 */
export function consumeRateLimit(
  key: string,
  options: { limit: number; windowMs: number }
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const entry = windowStore.get(key) || { hits: [] };
  pruneHits(now, entry, options.windowMs);

  if (entry.hits.length >= options.limit) {
    const oldest = entry.hits[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000));
    windowStore.set(key, entry);
    return { ok: false, retryAfterSec };
  }

  entry.hits.push(now);
  windowStore.set(key, entry);
  return { ok: true };
}

export function isFailureLocked(
  key: string
): { blocked: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const entry = failStore.get(key);
  if (!entry) return { blocked: false };

  if (entry.blockedUntil && entry.blockedUntil > now) {
    return {
      blocked: true,
      retryAfterSec: Math.ceil((entry.blockedUntil - now) / 1000),
    };
  }

  return { blocked: false };
}

export function recordFailure(
  key: string,
  options: { failLimit: number; windowMs: number; blockMs?: number }
): void {
  const now = Date.now();
  const entry = failStore.get(key) || { failures: [] };
  pruneFails(now, entry, options.windowMs);
  entry.failures.push(now);

  if (entry.failures.length >= options.failLimit) {
    entry.blockedUntil = now + (options.blockMs ?? options.windowMs);
    entry.failures = [];
  }

  failStore.set(key, entry);
}

export function clearFailures(key: string): void {
  failStore.delete(key);
}

/** 公开图库：同一 IP 每分钟最多 30 次 */
export const GALLERY_RATE_LIMIT = {
  limit: 30,
  windowMs: 60_000,
} as const;

/** 分享密码：同一 token+IP，15 分钟内失败 5 次后锁定 15 分钟 */
export const SHARE_PASSWORD_RATE_LIMIT = {
  failLimit: 5,
  windowMs: 15 * 60 * 1000,
  blockMs: 15 * 60 * 1000,
} as const;

export function galleryRateLimitKey(ip: string): string {
  return `gallery:${ip || 'unknown'}`;
}

export function sharePasswordRateLimitKey(token: string, ip: string): string {
  return `share-pw:${token}:${ip || 'unknown'}`;
}
