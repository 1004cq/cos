/**
 * COS 分片上传（Multipart）：初始化 / 分片预签名 PUT / 完成。
 * 原字节无损；>100MB 走此路径，小文件仍用单次 PUT。
 */

import COS from 'cos-nodejs-sdk-v5';
import { getCosConfig, type CosRuntimeConfig } from './settings';

let stsModule: {
  getUploadStsCredential?: (s: number) => Promise<{
    credentials: {
      tmpSecretId: string;
      tmpSecretKey: string;
      sessionToken: string;
    };
  }>;
  isStsEnabled?: () => boolean;
} | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  stsModule = require('./sts');
} catch {
  stsModule = null;
}

async function loadConfig(): Promise<CosRuntimeConfig> {
  const cfg = await getCosConfig();
  if (!cfg.secretId || !cfg.secretKey || !cfg.bucket || !cfg.region) {
    throw new Error('COS 未配置完整，请在后台「COS 设置」或 .env 中填写');
  }
  return cfg;
}

function createClient(cfg: CosRuntimeConfig, token?: string) {
  return new COS({
    SecretId: cfg.secretId,
    SecretKey: cfg.secretKey,
    ...(token ? { SecurityToken: token } : {}),
  });
}

function assertPutUrlIsCosOrigin(url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new Error('生成的预签名 URL 无效');
  }
  if (!host || /[^\x00-\x7F]/.test(host) || host.includes('xn--')) {
    throw new Error('预签名 PUT 不可使用中文/IDN 域名');
  }
  const ok =
    (host.includes('.cos.') && host.endsWith('.myqcloud.com')) ||
    /^cos\.[a-z0-9-]+\.myqcloud\.com$/.test(host);
  if (!ok) {
    throw new Error('预签名 PUT 必须指向 COS 源站（不可用 CDN）');
  }
}

async function resolveUploadClient(cfg: CosRuntimeConfig): Promise<{
  client: COS;
  viaSts: boolean;
}> {
  if (stsModule?.isStsEnabled?.()) {
    try {
      const sts = await stsModule.getUploadStsCredential!(3600);
      return {
        client: new COS({
          SecretId: sts.credentials.tmpSecretId,
          SecretKey: sts.credentials.tmpSecretKey,
          SecurityToken: sts.credentials.sessionToken,
        }),
        viaSts: true,
      };
    } catch (err) {
      console.warn('STS multipart 失败，回退永久密钥:', err);
    }
  }
  return { client: createClient(cfg), viaSts: false };
}

export async function initMultipartUpload(
  key: string,
  contentType: string
): Promise<{ uploadId: string; key: string; viaSts: boolean }> {
  if (!key.startsWith('media/')) {
    throw new Error('非法的上传路径');
  }
  const cfg = await loadConfig();
  const { client, viaSts } = await resolveUploadClient(cfg);

  const data = await new Promise<COS.MultipartInitResult>((resolve, reject) => {
    client.multipartInit(
      {
        Bucket: cfg.bucket,
        Region: cfg.region,
        Key: key,
        ContentType: contentType,
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
  });

  if (!data.UploadId) {
    throw new Error('初始化分片失败：无 UploadId');
  }

  return { uploadId: data.UploadId, key, viaSts };
}

/** 为单个分片生成 PUT 预签名（含 uploadId + partNumber） */
export async function getMultipartPartPresignedUrl(
  key: string,
  uploadId: string,
  partNumber: number,
  expires = 600
): Promise<{ url: string; viaSts: boolean }> {
  if (!key.startsWith('media/')) {
    throw new Error('非法的上传路径');
  }
  if (!uploadId || !Number.isFinite(partNumber) || partNumber < 1 || partNumber > 10_000) {
    throw new Error('无效的分片参数');
  }

  const cfg = await loadConfig();
  const safeExpires = Math.min(Math.max(expires, 60), 600);
  const { client, viaSts } = await resolveUploadClient(cfg);

  const url = await new Promise<string>((resolve, reject) => {
    client.getObjectUrl(
      {
        Bucket: cfg.bucket,
        Region: cfg.region,
        Key: key,
        Method: 'PUT',
        Sign: true,
        Expires: safeExpires,
        Query: {
          partNumber: String(partNumber),
          uploadId,
        },
      },
      (err, data) => {
        if (err) return reject(err);
        resolve(data.Url);
      }
    );
  });

  assertPutUrlIsCosOrigin(url);
  return { url, viaSts };
}

export type MultipartPart = { PartNumber: number; ETag: string };

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: MultipartPart[]
): Promise<void> {
  if (!key.startsWith('media/')) {
    throw new Error('非法的上传路径');
  }
  if (!uploadId || !Array.isArray(parts) || parts.length === 0) {
    throw new Error('缺少分片列表');
  }

  const normalized = parts
    .map((p) => ({
      PartNumber: Number(p.PartNumber),
      ETag: String(p.ETag || '').replace(/^"|"$/g, ''),
    }))
    .filter((p) => p.PartNumber >= 1 && p.ETag)
    .sort((a, b) => a.PartNumber - b.PartNumber);

  if (normalized.length === 0) {
    throw new Error('分片 ETag 无效');
  }

  const cfg = await loadConfig();
  const { client } = await resolveUploadClient(cfg);

  await new Promise<void>((resolve, reject) => {
    client.multipartComplete(
      {
        Bucket: cfg.bucket,
        Region: cfg.region,
        Key: key,
        UploadId: uploadId,
        Parts: normalized,
      },
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  if (!key.startsWith('media/')) return;
  const cfg = await loadConfig();
  const { client } = await resolveUploadClient(cfg);
  await new Promise<void>((resolve) => {
    client.multipartAbort(
      {
        Bucket: cfg.bucket,
        Region: cfg.region,
        Key: key,
        UploadId: uploadId,
      },
      () => resolve()
    );
  });
}

export {
  MULTIPART_PART_SIZE,
  MULTIPART_THRESHOLD,
} from '@/lib/media-type';
