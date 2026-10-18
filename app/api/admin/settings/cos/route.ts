import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { formatCosError } from '@/lib/cos-errors';
import {
  getCosConfig,
  getOssConfig,
  getStorageConfigPublic,
  getS3Config,
  parseProviderId,
  resetStorageProviderCache,
  saveStorageConfig,
  getStorageProvider,
} from '@/lib/storage';
import { formatOssError } from '@/lib/storage/oss-provider';
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

/** 保存存储配置（可含 provider + cos / s3 / oss） */
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
      (provider === 'cos' || (!provider && body.bucket != null && !body.accessKeyId)
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

    const oss =
      body.oss ||
      (provider === 'oss'
        ? {
            accessKeyId: body.accessKeyId ?? body.secretId,
            accessKeySecret: body.accessKeySecret ?? body.secretKey,
            bucket: body.bucket,
            region: body.region,
            endpoint: body.endpoint,
            cname: body.cname === undefined ? undefined : Boolean(body.cname),
            cdnDomain: body.cdnDomain,
            publicBaseUrl: body.publicBaseUrl,
            thumbWidth: body.thumbWidth != null ? Number(body.thumbWidth) : undefined,
            watermarkEnabled:
              body.watermarkEnabled === undefined
                ? undefined
                : Boolean(body.watermarkEnabled),
            watermarkText:
              body.watermarkText === undefined ? undefined : String(body.watermarkText),
          }
        : undefined);

    await saveStorageConfig({ provider, cos, s3, oss });
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
  const currentId = hint || (await getStorageProvider()).id;

  if (currentId === 's3') {
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
          provider: 's3' as const,
        };
      } finally {
        (p as { dispose?: () => void }).dispose?.();
      }
    }
    try {
      const p = await getStorageProvider();
      const r = await p.testConnection?.();
      const s3 = await getS3Config();
      return {
        ok: Boolean(r?.ok),
        error: r?.error,
        detail: r?.detail,
        bucket: s3.bucket,
        region: s3.region,
        provider: 's3' as const,
      };
    } catch (err) {
      const s3 = await getS3Config();
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        bucket: s3.bucket,
        region: s3.region,
        provider: 's3' as const,
      };
    }
  }

  if (currentId === 'oss') {
    if (
      override &&
      (override.accessKeyId || override.accessKeySecret || override.bucket || override.endpoint)
    ) {
      const { OssStorageProvider } = await import('@/lib/storage/oss-provider');
      const base = await getOssConfig();
      const cfg = {
        ...base,
        accessKeyId:
          override.accessKeyId && !String(override.accessKeyId).includes('****')
            ? String(override.accessKeyId).trim()
            : base.accessKeyId,
        accessKeySecret:
          override.accessKeySecret && !String(override.accessKeySecret).includes('****')
            ? String(override.accessKeySecret).trim()
            : base.accessKeySecret,
        bucket: String(override.bucket || base.bucket).trim(),
        region: String(override.region || base.region).trim() || 'oss-cn-hangzhou',
        endpoint: String(override.endpoint ?? base.endpoint).trim(),
        cname:
          override.cname !== undefined ? Boolean(override.cname) : base.cname,
      };
      const p = new OssStorageProvider(cfg);
      try {
        const r = await p.testConnection!();
        return {
          ok: r.ok,
          error: r.error,
          detail: r.detail,
          bucket: cfg.bucket,
          region: cfg.region,
          endpoint: cfg.endpoint,
          provider: 'oss' as const,
        };
      } finally {
        p.dispose?.();
      }
    }
    try {
      const p = await getStorageProvider();
      const r = await p.testConnection?.();
      const oss = await getOssConfig();
      return {
        ok: Boolean(r?.ok),
        error: r?.ok === false ? r.error || formatOssError(new Error('OSS 连通失败')) : r?.error,
        detail: r?.detail,
        bucket: oss.bucket,
        region: oss.region,
        endpoint: oss.endpoint,
        provider: 'oss' as const,
      };
    } catch (err) {
      const oss = await getOssConfig();
      return {
        ok: false,
        error: formatOssError(err),
        bucket: oss.bucket,
        region: oss.region,
        endpoint: oss.endpoint,
        provider: 'oss' as const,
      };
    }
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
