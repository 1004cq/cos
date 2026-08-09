import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCosConfig, getCosConfigPublic, saveCosConfig } from '@/lib/settings';
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
    const { secretId, secretKey, bucket, region, cdnDomain, thumbWidth, test } = body;

    await saveCosConfig({
      secretId,
      secretKey,
      bucket,
      region,
      cdnDomain,
      thumbWidth: thumbWidth != null ? Number(thumbWidth) : undefined,
    });

    // 可选：保存后测连通性
    if (test) {
      const ok = await testCosConnection();
      const config = await getCosConfigPublic();
      return NextResponse.json({ ...config, test: ok });
    }

    const config = await getCosConfigPublic();
    return NextResponse.json(config);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '保存失败';
    console.error('save cos settings error:', error);
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

    // 允许用请求体临时参数测试（未保存）
    const body = await req.json().catch(() => ({}));
    const result = await testCosConnection(body);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '测试失败';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function testCosConnection(override?: {
  secretId?: string;
  secretKey?: string;
  bucket?: string;
  region?: string;
}) {
  const cfg = await getCosConfig();
  const secretId = override?.secretId?.trim() || cfg.secretId;
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

  await new Promise<void>((resolve, reject) => {
    cos.headBucket({ Bucket: bucket, Region: region }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  return { ok: true, bucket, region };
}
