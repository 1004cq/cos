import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  IPv4,
  loadContentFromFile,
  loadHeaderFromFile,
  newWithBuffer,
  type Searcher,
} from 'ip2region.js';
import { isIpv4, isIpv6, isNonPublicOrInvalidIp, normalizeIp } from '@/lib/client-ip';

/**
 * 离线 IPv4 归属地（ip2region xdb v3 / ip2region_v4.xdb）。
 *
 * 仅省市级、约值，不到县。IPv6 / 内网 / 解析失败 → 「—」。
 *
 * 数据文件优先级：
 * 1. 环境变量 IP2REGION_DB
 * 2. data/ip2region_v4.xdb（仓库内随镜像打包）
 * 3. data/ip2region.xdb（兼容旧文件名）
 *
 * 更新：见 data/README.md，或 `npm run ip2region:update` 后重新构建镜像。
 */

export type IpRegion = {
  country: string;
  province: string;
  city: string;
  text: string;
};

const UNKNOWN: IpRegion = { country: '', province: '', city: '', text: '—' };

const cache = new Map<string, IpRegion>();
const CACHE_MAX = 4_000;

let searcher: Searcher | null | undefined;

function resolveDbPath(): string | null {
  const fromEnv = process.env.IP2REGION_DB?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const v4 = path.join(process.cwd(), 'data', 'ip2region_v4.xdb');
  if (existsSync(v4)) return v4;
  const legacy = path.join(process.cwd(), 'data', 'ip2region.xdb');
  if (existsSync(legacy)) return legacy;
  return null;
}

function getSearcher() {
  if (searcher !== undefined) return searcher;
  try {
    const dbPath = resolveDbPath();
    if (!dbPath) {
      console.warn('ip-region: xdb not found (expected data/ip2region_v4.xdb)');
      searcher = null;
      return null;
    }
    const header = loadHeaderFromFile(dbPath);
    const created = header?.createdAt
      ? new Date(header.createdAt * 1000).toISOString().slice(0, 10)
      : 'unknown';
    const buffer = loadContentFromFile(dbPath);
    searcher = newWithBuffer(IPv4, buffer);
    console.info(`ip-region: loaded ${dbPath} (xdb v${header?.version ?? '?'}, ${created})`);
    return searcher;
  } catch (err) {
    console.warn('ip-region: failed to load xdb', err);
    searcher = null;
    return null;
  }
}

function cleanPart(value: string | undefined): string {
  const t = (value || '').trim();
  if (!t || t === '0' || t === '内网IP' || t === '本机地址' || t === '-') return '';
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

/**
 * 兼容两种 xdb 字段：
 * - 旧：Country|Area|Province|City|ISP
 * - 新 v3：Country|Province|City|ISP|ISO
 */
export function parseRegionString(region: string | null | undefined): IpRegion {
  if (!region) return UNKNOWN;
  if (region.includes('内网IP')) return UNKNOWN;
  const parts = region.split('|').map((p) => p.trim());
  let country = '';
  let province = '';
  let city = '';

  if (parts.length >= 5 && (parts[1] === '0' || parts[1] === '' || parts[1] === '内网IP')) {
    country = cleanPart(parts[0]);
    province = cleanPart(parts[2]);
    city = cleanPart(parts[3]);
  } else {
    country = cleanPart(parts[0]);
    province = cleanPart(parts[1]);
    city = cleanPart(parts[2]);
  }

  if (!country && !province && !city) return UNKNOWN;
  return {
    country,
    province,
    city,
    text: formatApproxText(country, province, city),
  };
}

/** 约 广东 深圳 — 不暗示精确到区县 */
export function formatApproxText(country: string, province: string, city: string): string {
  const cn = country === '中国' || country === '中国内地' || country === 'China';
  if (cn) {
    const p = stripAdminSuffix(province);
    const c = stripAdminSuffix(city);
    if (p && c && p !== c && !c.startsWith(p) && !p.startsWith(c)) {
      return `约 ${p} ${c}`;
    }
    const one = p || c;
    return one ? `约 ${one}` : '约 中国';
  }

  const uniq: string[] = [];
  for (const part of [country, province, city].map(stripAdminSuffix)) {
    if (part && !uniq.includes(part)) uniq.push(part);
  }
  if (uniq.length === 0) return '—';
  return `约 ${uniq.slice(0, 2).join(' ')}`;
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
  const raw = normalizeIp(ip) || (ip || '').trim();
  if (!raw) return UNKNOWN;
  const cached = cache.get(raw);
  if (cached) return cached;

  if (isNonPublicOrInvalidIp(raw)) return remember(raw, UNKNOWN);
  if (isIpv6(raw) && !isIpv4(raw)) return remember(raw, UNKNOWN);
  if (!isIpv4(raw)) return remember(raw, UNKNOWN);

  try {
    const s = getSearcher();
    if (!s) return remember(raw, UNKNOWN);
    const region = await s.search(raw);
    return remember(raw, parseRegionString(region));
  } catch (err) {
    console.warn('ip-region lookup failed:', raw, err);
    return remember(raw, UNKNOWN);
  }
}

export async function regionTextAsync(ip: string): Promise<string> {
  return (await lookupIpRegion(ip)).text;
}
