/**
 * API 对外错误文案：生产环境隐藏内部细节，开发环境可回传 message。
 */

const GENERIC = '操作失败，请稍后重试';

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * 记录完整错误到服务端日志，返回适合放进 JSON 的对外文案。
 * @param fallback 业务侧默认中文提示（生产也可用，若不含敏感信息）
 */
export function publicApiError(
  error: unknown,
  fallback = GENERIC,
  logLabel = 'api error'
): string {
  console.error(logLabel, error);
  if (isProduction()) {
    return fallback;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}
