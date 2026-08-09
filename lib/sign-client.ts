/**
 * 客户端请求签名 URL（必须走 /api/sign）
 */
export async function fetchSignedUrl(
  key: string,
  options?: { thumb?: boolean; expires?: number }
): Promise<string | null> {
  const params = new URLSearchParams({ key });
  if (options?.thumb) params.set('thumb', '1');
  if (options?.expires) params.set('expires', String(options.expires));

  try {
    const res = await fetch(`/api/sign?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.url === 'string' ? data.url : null;
  } catch {
    return null;
  }
}
