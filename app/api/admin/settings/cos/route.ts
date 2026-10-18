import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { formatCosError } from '@/lib/cos-errors';
import {
  getCosConfig,
  getStorageConfigPublic,
  getS3Config,
  parseProviderId,
  resetStorageProviderCache,
  saveStorageConfig,
  getStorageProvider,
} from '@/lib/storage';
import { formatS3Error } from '@/lib/storage/s3-provider';
import COS from 'cos-nodejs-sdk-v5';

/** 读取当前存储配置（密钥脱敏；含 provider） */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const config = await getStorageConfigPublic();
    return NextResponse.json(config);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '读取失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** 保存存储配置（可含 provider + cos / s3） */
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const provider = body.provider
      ? parseProviderId(String(body.provider))
      : undefined;

    const cos =
      body.cos ||
      (provider === 'cos' || (!provider && body.bucket != null)
        ? {
            secretId: body.secretId,
            secretKey: body.secretKey,
            bucket: body.bucket,
            region: body.region,
            cdnDomain: body.cdnDomain,
            thumbWidth: body.thumbWidth != null ? Number(body.thumbWidth) : undefined,
            watermarkEnabled:
              body.watermarkEnabled === undefined
                ? undefined
                : Boolean(body.watermarkEnabled),
            watermarkText:
              body.watermarkText === undefined ? undefined : String(body.watermarkText),
            imageStyleThumb:
              body.imageStyleThumb === undefined
                ? undefined
                : String(body.imageStyleThumb),
            imageStyleFull:
              body.imageStyleFull === undefined
                ? undefined
                : String(body.imageStyleFull),
          }
        : undefined);

    const s3 =
      body.s3 ||
      (provider === 's3'
        ? {
            accessKeyId: body.accessKeyId ?? body.secretId,
            secretAccessKey: body.secretAccessKey ?? body.secretKey,
            bucket: body.bucket,
            region: body.region,
            endpoint: body.endpoint,
            forcePathStyle:
              body.forcePathStyle === undefined
                ? undefined
                : Boolean(body.forcePathStyle),
            cdnDomain: body.cdnDomain,
            publicBaseUrl: body.publicBaseUrl,
          }
        : undefined);

    await saveStorageConfig({ provider, cos, s3 });
    resetStorageProviderCache();

    const config = await getStorageConfigPublic();

    if (body.test) {
      const testResult = await testStorageConnection(provider);
      return NextResponse.json({ ...config, test: testResult });
    }

    return NextResponse.json(config);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '保存失败';
    console.error('save storage settings error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** 仅测试连通性，不改配置 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const provider = body.provider
      ? parseProviderId(String(body.provider))
      : undefined;
    const result = await testStorageConnection(provider, body);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: formatCosError(error) },
      { status: 500 }
    );
  }
}

async function testStorageConnection(
  providerHint?: ReturnType<typeof parseProviderId>,
  override?: Record<string, unknown>
) {
  const hint = providerHint;
  // 临时覆盖：COS headBucket 仍用专用逻辑；S3 用 Provider.testConnection
  if (hint === 's3' || (!hint && (await getStorageProvider()).id === 's3')) {
    // 若表单带了覆盖字段，先不写库，用临时 S3 provider
    if (override && (override.accessKeyId || override.endpoint || override.bucket)) {
      const { S3StorageProvider } = await import('@/lib/storage/s3-provider');
      const base = await getS3Config();
      const cfg = {
        ...base,
        accessKeyId:
          override.accessKeyId && !String(override.accessKeyId).includes('****')
            ? String(override.accessKeyId).trim()
            : base.accessKeyId,
        secretAccessKey:
          override.secretAccessKey && !String(override.secretAccessKey).includes('****')
            ? String(override.secretAccessKey).trim()
            : base.secretAccessKey,
        bucket: String(override.bucket || base.bucket).trim(),
        region: String(override.region || base.region).trim() || 'auto',
        endpoint: String(override.endpoint ?? base.endpoint).trim(),
        forcePathStyle:
          override.forcePathStyle !== undefined
            ? Boolean(override.forcePathStyle)
            : base.forcePathStyle,
      };
      const p = new S3StorageProvider(cfg);
      try {
        const r = await p.testConnection!();
        return {
          ok: r.ok,
          error: r.error,
          detail: r.detail,
          bucket: cfg.bucket,
          region: cfg.region,
          endpoint: cfg.endpoint,
          provider: 's3' as const,
        };
      } finally {
        p.dispose();
      }
    }
    const p = await getStorageProvider();
    try {
      const r = await p.testConnection?.();
      const s3 = await getS3Config();
      return {
        ok: Boolean(r?.ok),
        error: r?.ok === false ? r.error || formatS3Error(new Error(r.error || 'S3 连通失败')) : r?.error,
        detail: r?.detail,
        bucket: s3.bucket,
        region: s3.region,
        endpoint: s3.endpoint,
        provider: 's3' as const,
      };
    } catch (err) {
      const s3 = await getS3Config();
      return {
        ok: false,
        error: formatS3Error(err),
        bucket: s3.bucket,
        region: s3.region,
        endpoint: s3.endpoint,
        provider: 's3' as const,
      };
    }
  }

  if (hint === 'oss') {
    return { ok: false, error: '阿里云 OSS 尚未实现', provider: 'oss' as const };
  }

  return testCosConnection(override);
}

async function testCosConnection(override?: Record<string, unknown>) {
  const cfg = await getCosConfig();
  const secretId =
    override?.secretId && !String(override.secretId).includes('****')
      ? String(override.secretId).trim()
      : cfg.secretId;
  const secretKey =
    override?.secretKey && !String(override.secretKey).includes('****')
      ? String(override.secretKey).trim()
      : cfg.secretKey;
  const bucket = String(override?.bucket || cfg.bucket).trim();
  const region = String(override?.region || cfg.region).trim();

  if (!secretId || !secretKey || !bucket || !region) {
    return {
      ok: false,
      error: '配置不完整：需要 SecretId / SecretKey / Bucket / Region',
      provider: 'cos' as const,
    };
  }

  const cos = new COS({ SecretId: secretId, SecretKey: secretKey });

  try {
    await new Promise<void>((resolve, reject) => {
      cos.headBucket({ Bucket: bucket, Region: region }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    return { ok: true, bucket, region, provider: 'cos' as const };
  } catch (err) {
    return {
      ok: false,
      error: formatCosError(err),
      bucket,
      region,
      provider: 'cos' as const,
    };
  }
}
