/**
 * 登录失败限流（进程内 Map）
 *
 * 规则：同一 IP 在 WINDOW_MS 内失败 FAIL_LIMIT 次后，暂时拒绝登录。
 *
 * 限制说明：Serverless / 多实例部署时各实例内存不共享，限流为「尽力而为」。
 * 单机 Docker / 长驻 Node 进程下生效可靠。若以后有 Redis，可换为共享存储。
 */

const WINDOW_MS = 15 * 60 * 1000;
const FAIL_LIMIT = 5;

type Entry = {
  failures: number[];
  blockedUntil?: number;
};

const store = new Map<string, Entry>();

function prune(now: number, entry: Entry): void {
  entry.failures = entry.failures.filter((t) => now - t < WINDOW_MS);
}

export function getClientIp(headers?: Headers | Record<string, string | string[] | undefined>): string {
  if (!headers) return 'unknown';

  const get = (key: string): string | undefined => {
    if (typeof (headers as Headers).get === 'function') {
      return (headers as Headers).get(key) || undefined;
    }
    const v = (headers as Record<string, string | string[] | undefined>)[key];
    if (Array.isArray(v)) return v[0];
    return v;
  };

  const forwarded = get('x-forwarded-for') || get('x-real-ip') || get('cf-connecting-ip');
  if (forwarded) {
    return forwarded.split(',')[0]!.trim() || 'unknown';
  }
  return 'unknown';
}

export function isLoginBlocked(ip: string): { blocked: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const entry = store.get(ip);
  if (!entry) return { blocked: false };

  if (entry.blockedUntil && entry.blockedUntil > now) {
    return {
      blocked: true,
      retryAfterSec: Math.ceil((entry.blockedUntil - now) / 1000),
    };
  }

  prune(now, entry);
  if (entry.failures.length === 0 && !entry.blockedUntil) {
    store.delete(ip);
  }
  return { blocked: false };
}

export function recordLoginFailure(ip: string): void {
  const now = Date.now();
  const entry = store.get(ip) || { failures: [] };
  prune(now, entry);
  entry.failures.push(now);

  if (entry.failures.length >= FAIL_LIMIT) {
    entry.blockedUntil = now + WINDOW_MS;
    entry.failures = [];
  }

  store.set(ip, entry);
}

export function clearLoginFailures(ip: string): void {
  store.delete(ip);
}

export const LOGIN_RATE_LIMIT = {
  windowMs: WINDOW_MS,
  failLimit: FAIL_LIMIT,
} as const;
