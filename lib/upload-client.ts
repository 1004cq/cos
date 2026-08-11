/**
 * 上传页客户端工具：超时、API 错误文案、PUT 源站校验
 */

/** 获取预签名超时 */
export const PRESIGN_TIMEOUT_MS = 30_000;

/** 入库（含短超时 CI 截帧）超时 */
export const MEDIA_SAVE_TIMEOUT_MS = 45_000;

/** 客户端视频截帧海报上传总超时（失败可跳过，由服务端短超时 CI 兜底） */
export const CLIENT_POSTER_TIMEOUT_MS = 25_000;

/** PUT 最短 / 最长超时（按文件大小插值） */
export const PUT_TIMEOUT_MIN_MS = 5 * 60_000;
export const PUT_TIMEOUT_MAX_MS = 10 * 60_000;

/** 按体积估算 PUT 超时：约每 MB 预留 8s，夹在 5–10 分钟 */
export function putTimeoutMs(sizeBytes: number): number {
  const size = Math.max(0, sizeBytes);
  const perMb = 8_000;
  const estimated = Math.ceil(size / (1024 * 1024)) * perMb;
  return Math.min(PUT_TIMEOUT_MAX_MS, Math.max(PUT_TIMEOUT_MIN_MS, estimated || PUT_TIMEOUT_MIN_MS));
}

export type UploadPhase = 'presign' | 'put' | 'saving';

export function uploadPhaseLabel(phase: UploadPhase, progress: number): string {
  switch (phase) {
    case 'presign':
      return '获取预签名…';
    case 'put':
      return `上传中 ${Math.max(0, Math.min(100, progress))}%`;
    case 'saving':
      return '入库中…';
    default:
      return '处理中…';
  }
}

/** 解析接口非 2xx 的 error 字段 */
export async function readApiError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
  if (data && typeof data.error === 'string' && data.error.trim()) {
    return data.error.trim();
  }
  return `${fallback}（HTTP ${res.status}）`;
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number,
  timeoutMessage: string
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(timeoutMessage);
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(timeoutMessage);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 确认 PUT URL 仅为 COS 源站（含 .cos. / myqcloud），禁止 CDN 与中文域名。
 * 服务端 getUploadPresignedUrl 已不对 PUT 套 CDN；此处为客户端兜底。
 */
export function assertCosOriginPutUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('预签名 URL 无效');
  }

  const host = parsed.hostname.toLowerCase();
  if (!host) {
    throw new Error('预签名 URL 缺少主机名');
  }
  if (/[^\x00-\x7F]/.test(host) || host.includes('xn--')) {
    throw new Error('预签名 PUT 不可使用中文/IDN 域名，请使用 COS 源站');
  }

  const isCosOrigin =
    (host.includes('.cos.') && host.endsWith('.myqcloud.com')) ||
    /^cos\.[a-z0-9-]+\.myqcloud\.com$/.test(host);

  if (!isCosOrigin) {
    throw new Error('预签名 PUT 必须指向 COS 源站，不能使用 CDN 或自定义域名');
  }
}

/** XHR PUT 原文件，带进度与总超时 */
export function xhrPutFile(
  url: string,
  file: Blob,
  contentType: string,
  timeoutMs: number,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.timeout = timeoutMs;
    xhr.setRequestHeader('Content-Type', contentType);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`COS 上传失败: HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('网络错误，上传中断'));
    xhr.ontimeout = () =>
      reject(
        new Error(
          `上传超时（${Math.round(timeoutMs / 60000)} 分钟内未完成），请检查网络后重试`
        )
      );
    xhr.onabort = () => reject(new Error('上传已取消'));
    xhr.send(file);
  });
}
