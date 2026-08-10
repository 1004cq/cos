import fs from 'fs/promises';
import path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import type { Readable } from 'stream';

export type StorageBackend = 'cos' | 'local';

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

export function isStorageBackend(v: unknown): v is StorageBackend {
  return v === 'cos' || v === 'local';
}

/** 校验逻辑 key：必须以 media/ 开头，禁止穿越与绝对路径 */
export function assertSafeMediaKey(key: string): string {
  if (typeof key !== 'string' || !key) {
    throw new Error('非法的对象键');
  }
  if (key.includes('\0')) {
    throw new Error('非法的对象键');
  }
  const normalized = key.replace(/\\/g, '/');
  if (normalized !== key) {
    throw new Error('非法的对象键');
  }
  if (normalized.includes('..')) {
    throw new Error('非法路径');
  }
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    throw new Error('禁止绝对路径');
  }
  if (!normalized.startsWith('media/')) {
    throw new Error('key 必须以 media/ 开头');
  }
  if (normalized.includes('//')) {
    throw new Error('非法路径');
  }
  return normalized;
}

export function getLocalMediaRoot(): string {
  const root = (process.env.LOCAL_MEDIA_ROOT || '/data/gallery').trim() || '/data/gallery';
  return path.resolve(root);
}

/** 解析本地实路径并确保仍在 LOCAL_MEDIA_ROOT 下 */
export function resolveLocalMediaPath(key: string, root?: string): string {
  const safeKey = assertSafeMediaKey(key);
  const base = path.resolve(root || getLocalMediaRoot());
  const full = path.resolve(base, safeKey);
  const rel = path.relative(base, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('路径越界');
  }
  return full;
}

export function generateMediaKey(filename: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : 'bin';
  const safeExt = ext.replace(/[^a-z0-9]/gi, '') || 'bin';
  const random = Math.random().toString(36).slice(2, 10);
  return `media/${y}/${m}/${d}/${Date.now()}-${random}.${safeExt}`;
}

export async function ensureLocalDirForKey(key: string): Promise<string> {
  const full = resolveLocalMediaPath(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  return full;
}

export async function writeLocalMediaFile(
  key: string,
  source: Readable | Buffer
): Promise<{ path: string; size: number }> {
  const full = await ensureLocalDirForKey(key);
  if (Buffer.isBuffer(source)) {
    await fs.writeFile(full, source);
  } else {
    await pipeline(source, createWriteStream(full));
  }
  const st = await fs.stat(full);
  return { path: full, size: st.size };
}

export async function statLocalMedia(key: string): Promise<number | null> {
  try {
    const full = resolveLocalMediaPath(key);
    const st = await fs.stat(full);
    return st.size;
  } catch {
    return null;
  }
}

export async function deleteLocalMediaFile(key: string): Promise<void> {
  try {
    const full = resolveLocalMediaPath(key);
    await fs.unlink(full);
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : '';
    if (code === 'ENOENT') return;
    throw err;
  }
}

export function normalizeStorage(value: unknown, fallback: StorageBackend = 'cos'): StorageBackend {
  if (isStorageBackend(value)) return value;
  return fallback;
}
