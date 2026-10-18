/**
 * 预签名上传 key 短期绑定（进程内 Map）
 *
 * 预签名签发时登记，入库时校验并消费，防止任意 media/* key 被冒名入库。
 *
 * 限制说明：多实例 / Serverless 下内存不共享，为尽力而为；
 * TTL 内跨实例入库可能误拒，单机部署可靠。
 */

const TTL_MS = 15 * 60 * 1000;

const pending = new Map<string, number>();

function prune(now = Date.now()) {
  for (const [key, exp] of pending) {
    if (exp <= now) pending.delete(key);
  }
}

/** 登记刚签发的上传 key（TTL 15 分钟） */
export function rememberUploadKey(key: string): void {
  if (!key.startsWith('media/')) return;
  prune();
  pending.set(key, Date.now() + TTL_MS);
}

/** 是否仍在有效期内 */
export function hasUploadKey(key: string): boolean {
  prune();
  const exp = pending.get(key);
  if (exp == null) return false;
  if (exp <= Date.now()) {
    pending.delete(key);
    return false;
  }
  return true;
}

/** 入库成功后移除；返回是否曾存在 */
export function consumeUploadKey(key: string): boolean {
  prune();
  const ok = hasUploadKey(key);
  pending.delete(key);
  return ok;
}

export const UPLOAD_KEY_CACHE_TTL_MS = TTL_MS;
