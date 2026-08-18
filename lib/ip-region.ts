import { existsSync } from 'node:fs';
import path from 'node:path';
import * as Searcher from 'ip2region-ts';

/**
 * 离线 IP 归属地（ip2region xdb）。
 *
 * 安装：`npm i ip2region-ts`（包内自带 data/ip2region.xdb）
 * 更新：`npm update ip2region-ts`
 * 或下载官方库覆盖本地文件：
 *   https://github.com/lionsoul2014/ip2region/raw/master/data/ip2region.xdb
 *   放到 `data/ip2region.xdb`，或设置环境变量 IP2REGION_DB=/path/to/ip2region.xdb
 */

export type IpRegion = {
  country: string;
  province: string;
  city: string;
  text: string;
};

const UNKNOWN: IpRegion = { country: '', province: '', city: '', text: '—' };
const LOCAL: IpRegion = { country: '', province: '', city: '', text: '本地' };

const cache = new Map<string, IpRegion>();
const CACHE_MAX = 4_000;

let searcher: ReturnType<typeof Searcher.newWithBuffer> | null | undefined;

function resolveDbPath(): string | null {
  const fromEnv = process.env.IP2REGION_DB?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const local = path.join(process.cwd(), 'data', 'ip2region.xdb');
  if (existsSync(local)) return local;
  const bundled = Searcher.defaultDbFile;
  if (bundled && existsSync(bundled)) return bundled;
  return null;
}

function getSearcher() {
  if (searcher !== undefined) return searcher;
  try {
    const dbPath = resolveDbPath();
    if (!dbPath) {
      console.warn('ip-region: xdb not found');
      searcher = null;
      return null;
    }
    const buffer = Searcher.loadContentFromFile(dbPath);
    searcher = Searcher.newWithBuffer(buffer);
    return searcher;
  } catch (err) {
    console.warn('ip-region: failed to load xdb', err);
    searcher = null;
    return null;
  }
}

function isPrivateOrInvalid(ip: string): boolean {
  const raw = (ip || '').trim().toLowerCase();
  if (!raw || raw === 'unknown' || raw === '::1' || raw === 'localhost') return true;
  if (raw.startsWith('127.') || raw.startsWith('0.')) return true;
  if (raw.startsWith('10.')) return true;
  if (raw.startsWith('192.168.')) return true;
  if (raw.startsWith('169.254.')) return true;
  if (raw.startsWith('fc') || raw.startsWith('fd') || raw.startsWith('fe80')) return true;
  const m = raw.match(/^172\.(\d+)\./);
  if (m) {
    const n = Number(m[1]);
    if (n >= 16 && n <= 31) return true;
  }
  return false;
}

function cleanPart(value: string | undefined): string {
  const t = (value || '').trim();
  if (!t || t === '0' || t === '内网IP') return '';
  return t;
}

function stripAdminSuffix(name: string): string {
  return name
    .replace(/特别行政区$/u, '')
    .replace(/维吾尔自治区$/u, '')
    .replace(/壮族自治区$/u, '')
    .replace(/回族自治区$/u, '')
    .replace(/自治区$/u, '')
    .replace(/省$/u, '')
    .replace(/市$/u, '');
}

function formatText(country: string, province: string, city: string): string {
  const cn = country === '中国' || country === '中国内地';
  if (cn) {
    const p = stripAdminSuffix(province);
    const c = stripAdminSuffix(city);
    if (p && c) {
      if (p === c || c.startsWith(p)) return c;
      if (p.startsWith(c)) return p;
      return `${p}${c}`;
    }
    return p || c || country || '—';
  }
  const parts = [country, city || province].filter(Boolean);
  const uniq: string[] = [];
  for (const part of parts) {
    if (!uniq.includes(part)) uniq.push(part);
  }
  return uniq.join(' ') || '—';
}

function parseRegionString(region: string | null | undefined): IpRegion {
  if (!region) return UNKNOWN;
  const [countryRaw, , provinceRaw, cityRaw] = region.split('|');
  const country = cleanPart(countryRaw);
  const province = cleanPart(provinceRaw);
  const city = cleanPart(cityRaw);
  if (!country && !province && !city) return UNKNOWN;
  if (region.includes('内网IP')) return LOCAL;
  return {
    country,
    province,
    city,
    text: formatText(country, province, city),
  };
}

function remember(ip: string, value: IpRegion): IpRegion {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(ip, value);
  return value;
}

export async function lookupIpRegion(ip: string): Promise<IpRegion> {
  const raw = (ip || '').trim();
  if (!raw) return UNKNOWN;
  const cached = cache.get(raw);
  if (cached) return cached;
  if (isPrivateOrInvalid(raw)) return remember(raw, LOCAL);
  if (!Searcher.isValidIp(raw)) return remember(raw, UNKNOWN);

  try {
    const s = getSearcher();
    if (!s) return remember(raw, UNKNOWN);
    const data = await s.search(raw);
    const parsed = parseRegionString(data?.region);
    return remember(raw, parsed);
  } catch (err) {
    console.warn('ip-region lookup failed:', raw, err);
    return remember(raw, UNKNOWN);
  }
}

export async function regionTextAsync(ip: string): Promise<string> {
  return (await lookupIpRegion(ip)).text;
}
