/**
 * 服务端媒体元数据提取（失败不影响入库）。
 * 图片：exifr 取宽高 / takenAt
 * 视频：读对象头解析常见 MP4/MOV box；封面仍走 generateAndStoreVideoPoster
 */

import exifr from 'exifr';
import { getObjectBytes } from '@/lib/cos';

export type ExtractedMediaMeta = {
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  takenAt?: Date | null;
};

function finitePositive(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function readU32(buf: Buffer, offset: number, be = true): number {
  return be ? buf.readUInt32BE(offset) : buf.readUInt32LE(offset);
}

function readU16(buf: Buffer, offset: number, be = true): number {
  return be ? buf.readUInt16BE(offset) : buf.readUInt16LE(offset);
}

/** 从 MP4/MOV 头粗提取 duration / width / height（尽力而为） */
export function parseMp4Meta(buf: Buffer): ExtractedMediaMeta {
  const out: ExtractedMediaMeta = {};
  let offset = 0;
  const len = buf.length;

  function walk(start: number, end: number, depth: number) {
    if (depth > 12) return;
    let i = start;
    while (i + 8 <= end && i + 8 <= len) {
      let size = readU32(buf, i);
      const type = buf.toString('ascii', i + 4, i + 8);
      let header = 8;
      if (size === 1) {
        if (i + 16 > len) break;
        const hi = readU32(buf, i + 8);
        const lo = readU32(buf, i + 12);
        size = hi * 0x100000000 + lo;
        header = 16;
      } else if (size === 0) {
        size = end - i;
      }
      if (size < header || i + size > end) break;

      const contentStart = i + header;
      const contentEnd = i + size;

      if (type === 'moov' || type === 'trak' || type === 'mdia' || type === 'minf' || type === 'stbl') {
        walk(contentStart, contentEnd, depth + 1);
      } else if (type === 'mvhd' && contentEnd - contentStart >= 20) {
        const version = buf[contentStart] ?? 0;
        let timescale = 0;
        let duration = 0;
        if (version === 1 && contentEnd - contentStart >= 32) {
          timescale = readU32(buf, contentStart + 20);
          // duration is 64-bit; use low 32 if high is 0
          const durHi = readU32(buf, contentStart + 24);
          const durLo = readU32(buf, contentStart + 28);
          duration = durHi === 0 ? durLo : durHi * 0x100000000 + durLo;
        } else {
          timescale = readU32(buf, contentStart + 12);
          duration = readU32(buf, contentStart + 16);
        }
        if (timescale > 0 && duration > 0) {
          out.duration = Math.round(duration / timescale);
        }
      } else if (type === 'tkhd' && contentEnd - contentStart >= 84) {
        const version = buf[contentStart] ?? 0;
        // width/height are 16.16 fixed at end of tkhd
        let wOff = 0;
        let hOff = 0;
        if (version === 1) {
          wOff = contentStart + 88;
          hOff = contentStart + 92;
        } else {
          wOff = contentStart + 76;
          hOff = contentStart + 80;
        }
        if (hOff + 4 <= contentEnd) {
          const w = readU32(buf, wOff) / 65536;
          const h = readU32(buf, hOff) / 65536;
          const ww = finitePositive(w);
          const hh = finitePositive(h);
          if (ww && hh && (!out.width || ww * hh > (out.width || 0) * (out.height || 0))) {
            out.width = ww;
            out.height = hh;
          }
        }
      }

      i += size;
    }
  }

  walk(0, len, 0);
  return out;
}

async function extractImageMeta(key: string): Promise<ExtractedMediaMeta> {
  // 读前 2MB 足够大多 EXIF；超大图失败则退回更小范围
  let body: Buffer;
  try {
    const ranged = await getObjectBytes(key, { Range: 'bytes=0-2097151' });
    body = ranged.body;
  } catch {
    const full = await getObjectBytes(key);
    body = full.body;
  }

  const parsed = await exifr.parse(body, {
    pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate', 'ImageWidth', 'ImageHeight', 'ExifImageWidth', 'ExifImageHeight', 'Orientation'],
    translateKeys: false,
    reviveValues: true,
  });

  const width =
    finitePositive(parsed?.ExifImageWidth) ||
    finitePositive(parsed?.ImageWidth) ||
    null;
  const height =
    finitePositive(parsed?.ExifImageHeight) ||
    finitePositive(parsed?.ImageHeight) ||
    null;

  let takenAt: Date | null = null;
  const rawDate = parsed?.DateTimeOriginal || parsed?.CreateDate || parsed?.ModifyDate;
  if (rawDate instanceof Date && !Number.isNaN(rawDate.getTime())) {
    takenAt = rawDate;
  } else if (typeof rawDate === 'string') {
    const d = new Date(rawDate);
    if (!Number.isNaN(d.getTime())) takenAt = d;
  }

  // exifr 有时不给宽高：用 image-size 风格的最小 JPEG/PNG 探测
  let w = width;
  let h = height;
  if ((!w || !h) && body.length > 24) {
    const dims = peekImageSize(body);
    w = w || dims.width;
    h = h || dims.height;
  }

  return { width: w, height: h, takenAt };
}

function peekImageSize(buf: Buffer): { width: number | null; height: number | null } {
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return {
      width: finitePositive(readU32(buf, 16)),
      height: finitePositive(readU32(buf, 20)),
    };
  }
  // JPEG SOF
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = buf[i + 1]!;
      if (marker === 0xd9 || marker === 0xda) break;
      const size = readU16(buf, i + 2);
      if (size < 2) break;
      // SOF0–SOF3, SOF5–SOF7, SOF9–SOF11, SOF13–SOF15
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return {
          height: finitePositive(readU16(buf, i + 5)),
          width: finitePositive(readU16(buf, i + 7)),
        };
      }
      i += 2 + size;
    }
  }
  return { width: null, height: null };
}

async function extractVideoMeta(key: string): Promise<ExtractedMediaMeta> {
  // 读前 8MB：moov 常在文件头或尾；头失败再试尾部
  try {
    const head = await getObjectBytes(key, { Range: 'bytes=0-8388607' });
    const fromHead = parseMp4Meta(head.body);
    if (fromHead.duration || (fromHead.width && fromHead.height)) {
      return fromHead;
    }
  } catch (err) {
    console.warn('video meta head read failed:', key, err);
  }

  try {
    const sizeInfo = await getObjectBytes(key, { Range: 'bytes=0-0' });
    // content-range: bytes 0-0/total
    const range = sizeInfo.contentRange || '';
    const m = /\/(\d+)$/.exec(range);
    const total = m ? parseInt(m[1]!, 10) : 0;
    if (total > 8_388_608) {
      const start = Math.max(0, total - 8_388_608);
      const tail = await getObjectBytes(key, {
        Range: `bytes=${start}-${total - 1}`,
      });
      return parseMp4Meta(tail.body);
    }
  } catch (err) {
    console.warn('video meta tail read failed:', key, err);
  }

  return {};
}

/**
 * 提取元数据；失败返回空对象。
 * client 值作兜底，调用方合并：服务端有则优先。
 */
export async function extractMediaMetadata(
  key: string,
  mimeType: string
): Promise<ExtractedMediaMeta> {
  try {
    if (mimeType.startsWith('image/')) {
      return await extractImageMeta(key);
    }
    if (mimeType.startsWith('video/')) {
      return await extractVideoMeta(key);
    }
  } catch (err) {
    console.warn('extractMediaMetadata failed:', key, err);
  }
  return {};
}

/** 服务端优先，客户端兜底 */
export function mergeMeta(
  server: ExtractedMediaMeta,
  client: {
    width?: number | null;
    height?: number | null;
    duration?: number | null;
    takenAt?: string | Date | null;
  }
): {
  width: number | null;
  height: number | null;
  duration: number | null;
  takenAt: Date | null;
} {
  const clientTaken =
    client.takenAt == null || client.takenAt === ''
      ? null
      : client.takenAt instanceof Date
        ? client.takenAt
        : new Date(client.takenAt);
  const takenOk =
    clientTaken && !Number.isNaN(clientTaken.getTime()) ? clientTaken : null;

  return {
    width: server.width ?? finitePositive(client.width) ?? null,
    height: server.height ?? finitePositive(client.height) ?? null,
    duration: server.duration ?? finitePositive(client.duration) ?? null,
    takenAt: server.takenAt ?? takenOk,
  };
}
