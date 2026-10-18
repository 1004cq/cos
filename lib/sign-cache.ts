/**
 * 进程内 LRU：媒体列表 thumb/poster 签名缓存。
 * TTL ≈ 签名有效期的 60%，命中则跳过 COS 再签。
 */

export type SignCacheKind = 'thumb' | 'poster';

type Entry = {
  url: string;
  expiresAt: number;
};

const store = new Map<string, Entry>();
const MAX = 2_000;

function cacheKey(mediaId: string, kind: SignCacheKind, variant = ''): string {
  return `${mediaId}|${kind}|${variant}`;
}

function touch(key: string, entry: Entry): void {
  store.delete(key);
  store.set(key, entry);
}

function pruneExpired(now: number): void {
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k);
  }
  while (store.size > MAX) {
    const oldest = store.keys().next().value;
    if (oldest == null) break;
    store.delete(oldest);
  }
}

/** TTL 秒：签名有效期的 60%，至少 30s */
export function signCacheTtlSec(signExpiresSec: number): number {
  return Math.max(30, Math.floor(signExpiresSec * 0.6));
}

export function getCachedSignedUrl(
  mediaId: string,
  kind: SignCacheKind,
  variant = ''
): string | null {
  const key = cacheKey(mediaId, kind, variant);
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  touch(key, hit);
  return hit.url;
}

export function setCachedSignedUrl(
  mediaId: string,
  kind: SignCacheKind,
  url: string,
  ttlSec: number,
  variant = ''
): void {
  const now = Date.now();
  pruneExpired(now);
  const key = cacheKey(mediaId, kind, variant);
  touch(key, { url, expiresAt: now + ttlSec * 1000 });
}

export async function getOrSignCached(
  mediaId: string,
  kind: SignCacheKind,
  signExpiresSec: number,
  signer: () => Promise<string>,
  variant = ''
): Promise<string> {
  const hit = getCachedSignedUrl(mediaId, kind, variant);
  if (hit) return hit;
  const url = await signer();
  setCachedSignedUrl(mediaId, kind, url, signCacheTtlSec(signExpiresSec), variant);
  return url;
}
