/** 将腾讯云 COS SDK / HTTP 错误转为可读中文提示 */
export function formatCosError(err: unknown): string {
  if (!err) return '未知错误';

  const anyErr = err as {
    message?: string;
    code?: string;
    statusCode?: number;
    error?: { Code?: string; Message?: string; code?: string; message?: string };
  };

  const code =
    anyErr.code ||
    anyErr.error?.Code ||
    anyErr.error?.code ||
    '';
  const raw =
    anyErr.error?.Message ||
    anyErr.error?.message ||
    anyErr.message ||
    String(err);

  const lower = `${code} ${raw}`.toLowerCase();

  if (
    lower.includes('accessdenied') ||
    lower.includes('invalidaccesskeyid') ||
    lower.includes('signaturedoesnotmatch') ||
    lower.includes('403')
  ) {
    return '权限不足或密钥错误：请检查 SecretId / SecretKey，以及账号是否有该桶权限';
  }

  if (
    lower.includes('nosuchbucket') ||
    lower.includes('404') ||
    lower.includes('not found')
  ) {
    return '桶不存在或不在该 Region：请核对 Bucket 名称（含 -appid）与 Region';
  }

  if (lower.includes('invalidregion') || lower.includes('region')) {
    return 'Region 可能不正确：本站桶在香港请用 ap-hongkong；其它如 ap-guangzhou、ap-shanghai';
  }

  if (lower.includes('timeout') || lower.includes('enetunreach') || lower.includes('econnrefused')) {
    return '网络无法连通 COS，请稍后重试或检查出网策略';
  }

  // 去掉可能夹带的密钥片段
  const safe = raw.replace(/AKI[A-Z0-9]+/gi, 'AKID****').slice(0, 280);
  return code ? `${code}: ${safe}` : safe;
}
