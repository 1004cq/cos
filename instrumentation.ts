/**
 * Next.js 启动钩子：生产环境强制要求加密密钥，拒绝弱 fallback。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') return;

  const { assertSettingsEncryptConfigured } = await import('@/lib/settings');
  assertSettingsEncryptConfigured();
}
