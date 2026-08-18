import type { NextRequest } from 'next/server';

const UNKNOWN = 'unknown';

const IPV4_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

type HeaderSource = Headers | Record<string, string | string[] | undefined> | undefined;

function headerValue(headers: HeaderSource, key: string): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(key) || undefined;
  }
  const rec = headers as Record<string, string | string[] | undefined>;
  const lower = key.toLowerCase();
  const raw = rec[key] ?? rec[lower] ?? rec[key.replace(/-/g, '')];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

/** 去掉端口、方括号、IPv4-mapped IPv6，得到可查询的地址 */
export function normalizeIp(raw: string | null | undefined): string | null {
  let s = (raw || '').trim();
  if (!s) return null;
  if (
    s === UNKNOWN ||
    s === '-' ||
    s === 'null' ||
    s.toLowerCase() === 'unknown' ||
    s.toLowerCase() === 'localhost'
  ) {
    return null;
  }

  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    s = s.slice(1, -1).trim();
  }

  // RFC 7239 Forwarded: for=1.2.3.4 or for="[2001:db8::1]"
  const forMatch = /^for\s*=\s*(.+)$/i.exec(s);
  if (forMatch) s = forMatch[1].trim().replace(/^"|"$/g, '');

  if (s.startsWith('[') && s.includes(']')) {
    const inner = s.slice(1, s.indexOf(']'));
    s = inner;
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(s)) {
    s = s.replace(/:\d+$/, '');
  }

  if (s.toLowerCase().startsWith('::ffff:')) {
    const mapped = s.slice(7);
    if (IPV4_RE.test(mapped)) s = mapped;
  }

  s = s.trim();
  if (!s) return null;
  return s;
}

function ipv4Octets(ip: string): number[] | null {
  if (!IPV4_RE.test(ip)) return null;
  return ip.split('.').map((n) => Number(n));
}

export function isIpv4(ip: string): boolean {
  return ipv4Octets(ip) !== null;
}

export function isIpv6(ip: string): boolean {
  if (!ip.includes(':')) return false;
  if (ip.includes('.')) return false;
  return ip.split(':').length >= 3 && ip.split(':').length <= 8;
}

function isPrivateOrReservedIpv4(ip: string): boolean {
  const o = ipv4Octets(ip);
  if (!o) return true;
  const [a, b] = o;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateOrReservedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
  if (lower.startsWith('fe80')) return true; // link-local
  if (lower.startsWith('ff')) return true; // multicast
  if (lower.startsWith('2001:db8:')) return true; // documentation
  return false;
}

/** 是否可当作「客户端公网 IP」（IPv4 / IPv6） */
export function isPublicIp(ip: string): boolean {
  const n = normalizeIp(ip);
  if (!n) return false;
  if (isIpv4(n)) return !isPrivateOrReservedIpv4(n);
  if (isIpv6(n)) return !isPrivateOrReservedIpv6(n);
  return false;
}

/** 内网 / 无效 / unknown：不做归属地（展示 —） */
export function isNonPublicOrInvalidIp(ip: string): boolean {
  const n = normalizeIp(ip);
  if (!n) return true;
  if (isIpv4(n)) return isPrivateOrReservedIpv4(n);
  if (isIpv6(n)) return isPrivateOrReservedIpv6(n);
  return true;
}

function pushCandidates(out: string[], raw: string | undefined): void {
  if (!raw) return;
  for (const part of raw.split(',')) {
    const n = normalizeIp(part);
    if (n) out.push(n);
  }
}

/**
 * 从请求头取客户端 IP：
 * X-Forwarded-For 从左到右第一个公网 IP，忽略私有地址与 unknown。
 */
export function extractClientIp(headers?: HeaderSource, fallback?: string): string {
  const candidates: string[] = [];
  pushCandidates(candidates, headerValue(headers, 'x-forwarded-for'));
  pushCandidates(candidates, headerValue(headers, 'x-real-ip'));
  pushCandidates(candidates, headerValue(headers, 'cf-connecting-ip'));
  pushCandidates(candidates, headerValue(headers, 'true-client-ip'));
  pushCandidates(candidates, headerValue(headers, 'x-client-ip'));

  const forwarded = headerValue(headers, 'forwarded');
  if (forwarded) {
    for (const part of forwarded.split(',')) {
      const m = /for\s*=\s*([^;]+)/i.exec(part);
      if (m) pushCandidates(candidates, m[1]);
    }
  }

  const publicIp = candidates.find((ip) => isPublicIp(ip));
  if (publicIp) return publicIp.slice(0, 64);

  if (fallback) {
    const n = normalizeIp(fallback);
    if (n && isPublicIp(n)) return n.slice(0, 64);
    if (n) return n.slice(0, 64);
  }

  const firstValid = candidates[0];
  if (firstValid) return firstValid.slice(0, 64);
  return UNKNOWN;
}

export function getClientIp(req: NextRequest): string {
  const anyReq = req as unknown as { ip?: string };
  return extractClientIp(req.headers, anyReq.ip);
}
