/**
 * 轻量自测：客户端 IP 提取 + ip2region 文案（不连数据库）。
 * 运行：npx tsx scripts/check-ip-region.ts
 */
import { extractClientIp, isPublicIp, normalizeIp } from '../lib/client-ip';
import { lookupIpRegion, parseRegionString } from '../lib/ip-region';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

function headers(h: Record<string, string>): Headers {
  return new Headers(h);
}

function testClientIp() {
  assert(
    extractClientIp(headers({ 'x-forwarded-for': '192.168.1.8, 14.24.225.20' })) ===
      '14.24.225.20',
    'should skip private then take first public in XFF'
  );
  assert(
    extractClientIp(headers({ 'x-forwarded-for': 'unknown, 10.0.0.1, 120.229.32.1' })) ===
      '120.229.32.1',
    'should skip unknown and private'
  );
  assert(
    extractClientIp(headers({ 'x-forwarded-for': '::ffff:8.8.8.8' })) === '8.8.8.8',
    'should unwrap IPv4-mapped IPv6'
  );
  assert(
    extractClientIp(headers({ 'x-forwarded-for': '172.19.0.1' })) === '172.19.0.1',
    'only private → keep it (region will be —)'
  );
  assert(!isPublicIp('100.64.1.2'), 'CGNAT is not public');
  assert(!isPublicIp('127.0.0.1'), 'loopback is not public');
  assert(normalizeIp('1.2.3.4:443') === '1.2.3.4', 'strip ipv4 port');
  assert(extractClientIp(headers({})) === 'unknown', 'empty headers → unknown');
}

function testParse() {
  assert(parseRegionString('中国|广东省|深圳市|电信|CN').text === '约 广东 深圳', 'new v3 format');
  assert(parseRegionString('中国|0|广东省|广州市|电信').text === '约 广东 广州', 'legacy format');
  assert(parseRegionString('中国|北京市|北京市|移动|CN').text === '约 北京', 'municipality');
  assert(parseRegionString('0|0|0|内网IP|内网IP').text === '—', 'intranet');
  assert(parseRegionString('').text === '—', 'empty');
}

async function testLookup() {
  const shenzhen = await lookupIpRegion('120.229.32.1');
  assert(shenzhen.text.includes('广东') && shenzhen.text.startsWith('约 '), `mobile GD: ${shenzhen.text}`);
  const privateR = await lookupIpRegion('192.168.0.1');
  assert(privateR.text === '—', 'private → —');
  const v6 = await lookupIpRegion('240e:3b7:3272:d8d0::1');
  assert(v6.text === '—', 'IPv6 → —');
  const unk = await lookupIpRegion('unknown');
  assert(unk.text === '—', 'unknown → —');
}

async function main() {
  testClientIp();
  testParse();
  await testLookup();
  console.log('check-ip-region: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
