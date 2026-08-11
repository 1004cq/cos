import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCosConfig, getCosConfigPublic, saveCosConfig } from '@/lib/settings';
import { formatCosError } from '@/lib/cos-errors';
import COS from 'cos-nodejs-sdk-v5';

/** 读取当前 COS 配置（密钥脱敏） */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const config = await getCosConfigPublic();
    return NextResponse.json(config);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '读取失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** 保存 COS 配置 */
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const {
      secretId,
      secretKey,
      bucket,
      region,
      cdnDomain,
      thumbWidth,
      watermarkEnabled,
      watermarkText,
      test,
    } = body;

    await saveCosConfig({
      secretId,
      secretKey,
      bucket,
      region,
      cdnDomain,
      thumbWidth: thumbWidth != null ? Number(thumbWidth) : undefined,
      watermarkEnabled:
        watermarkEnabled === undefined ? undefined : Boolean(watermarkEnabled),
      watermarkText:
        watermarkText === undefined ? undefined : String(watermarkText),
    });

    const config = await getCosConfigPublic();

    if (test) {
      const testResult = await testCosConnection();
      return NextResponse.json({ ...config, test: testResult });
    }

    return NextResponse.json(config);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '保存失败';
    console.error('save cos settings error:', message);
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
    const result = await testCosConnection(body);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: formatCosError(error) },
      { status: 500 }
    );
  }
}

async function testCosConnection(override?: {
  secretId?: string;
  secretKey?: string;
  bucket?: string;
  region?: string;
}) {
  const cfg = await getCosConfig();
  const secretId =
    override?.secretId && !String(override.secretId).includes('****')
      ? override.secretId.trim()
      : cfg.secretId;
  const secretKey =
    override?.secretKey && !String(override.secretKey).includes('****')
      ? override.secretKey.trim()
      : cfg.secretKey;
  const bucket = override?.bucket?.trim() || cfg.bucket;
  const region = override?.region?.trim() || cfg.region;

  if (!secretId || !secretKey || !bucket || !region) {
    return { ok: false, error: '配置不完整：需要 SecretId / SecretKey / Bucket / Region' };
  }

  const cos = new COS({ SecretId: secretId, SecretKey: secretKey });

  try {
    await new Promise<void>((resolve, reject) => {
      cos.headBucket({ Bucket: bucket, Region: region }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    return { ok: true, bucket, region };
  } catch (err) {
    return { ok: false, error: formatCosError(err), bucket, region };
  }
}
