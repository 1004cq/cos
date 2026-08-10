import { createHmac, timingSafeEqual } from 'crypto';

function mediaTokenSecret(): string {
  return (
    process.env.NEXTAUTH_SECRET ||
    process.env.SETTINGS_ENCRYPT_KEY ||
    'cos-dev-insecure-key'
  );
}

/** 生成短时 HMAC：`${exp}.${sig}` */
export function signMediaFileToken(mediaId: string, expiresSec = 1800): string {
  const exp = Math.floor(Date.now() / 1000) + Math.min(Math.max(expiresSec, 60), 3600);
  const payload = `${mediaId}.${exp}`;
  const sig = createHmac('sha256', mediaTokenSecret()).update(payload).digest('base64url');
  return `${exp}.${sig}`;
}

export function verifyMediaFileToken(mediaId: string, token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [expStr, sig] = parts;
  const exp = parseInt(expStr || '', 10);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;

  const payload = `${mediaId}.${exp}`;
  const expected = createHmac('sha256', mediaTokenSecret()).update(payload).digest('base64url');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
