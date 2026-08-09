/**
 * 上传 MIME / 扩展名工具（浏览器与 API 共用）
 * 原则：原文件字节直传，不做转码；iPhone .MOV 空 type 时回退 video/quicktime
 */

const VIDEO_EXT_MIME: Record<string, string> = {
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
  '3gp': 'video/3gpp',
  '3gpp': 'video/3gpp',
  hevc: 'video/hevc',
  h265: 'video/hevc',
};

const IMAGE_EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
};

/** 明确允许的上传 MIME（另允许 image/*、video/* 前缀） */
const ALLOWED_EXACT = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
  'video/hevc',
  'video/h264',
  'video/3gpp',
  'video/webm',
  'video/mpeg',
]);

export function getExtension(filename: string): string {
  const base = filename.split(/[/\\]/).pop() || filename;
  const i = base.lastIndexOf('.');
  if (i < 0) return '';
  return base.slice(i + 1).toLowerCase();
}

/** 根据 filename + file.type 解析 Content-Type（PUT 与预签名必须一致） */
export function resolveUploadContentType(filename: string, fileType?: string | null): string {
  const typed = (fileType || '').trim().toLowerCase();
  if (typed && typed !== 'application/octet-stream') {
    return typed;
  }

  const ext = getExtension(filename);
  if (ext && VIDEO_EXT_MIME[ext]) return VIDEO_EXT_MIME[ext];
  if (ext && IMAGE_EXT_MIME[ext]) return IMAGE_EXT_MIME[ext];

  return typed || 'application/octet-stream';
}

export function isAllowedUploadMime(contentType: string): boolean {
  const t = contentType.trim().toLowerCase();
  if (!t) return false;
  if (ALLOWED_EXACT.has(t)) return true;
  if (t.startsWith('image/') || t.startsWith('video/')) return true;
  return false;
}

export function isVideoFilenameOrMime(filename: string, contentType: string): boolean {
  const t = contentType.toLowerCase();
  if (t.startsWith('video/')) return true;
  const ext = getExtension(filename);
  return Boolean(ext && VIDEO_EXT_MIME[ext]);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** 超过此大小提示保持屏幕常亮（单 PUT 仍无损；超大文件后续可加 multipart） */
export const LARGE_UPLOAD_BYTES = 100 * 1024 * 1024;
