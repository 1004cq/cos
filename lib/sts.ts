import STS from 'qcloud-cos-sts';

export type StsCredentialPayload = {
  startTime: number;
  expiredTime: number;
  credentials: {
    tmpSecretId: string;
    tmpSecretKey: string;
    sessionToken: string;
  };
  bucket: string;
  region: string;
  allowPrefix: string;
};

function parseBucketAppId(bucket: string): { appId: string } {
  const idx = bucket.lastIndexOf('-');
  if (idx <= 0 || idx === bucket.length - 1) {
    throw new Error('COS_BUCKET 格式应为 name-appid');
  }
  return { appId: bucket.slice(idx + 1) };
}

/** 是否启用 STS（默认：配置了密钥即启用，可用 COS_STS_ENABLED=0 关闭） */
export function isStsEnabled(): boolean {
  if (process.env.COS_STS_ENABLED === '0' || process.env.COS_STS_ENABLED === 'false') {
    return false;
  }
  return Boolean(
    process.env.COS_SECRET_ID &&
      process.env.COS_SECRET_KEY &&
      process.env.COS_BUCKET &&
      process.env.COS_REGION
  );
}

/**
 * 申请仅限 media/* 上传权限的临时密钥
 * duration 默认 15 分钟，最大 1 小时
 */
export async function getUploadStsCredential(
  durationSeconds = 900
): Promise<StsCredentialPayload> {
  const secretId = process.env.COS_SECRET_ID;
  const secretKey = process.env.COS_SECRET_KEY;
  const bucket = process.env.COS_BUCKET;
  const region = process.env.COS_REGION;

  if (!secretId || !secretKey) {
    throw new Error('缺少 COS_SECRET_ID / COS_SECRET_KEY');
  }
  if (!bucket || !region) {
    throw new Error('缺少 COS_BUCKET / COS_REGION');
  }

  const { appId } = parseBucketAppId(bucket);
  const allowPrefix = 'media/*';
  const safeDuration = Math.min(Math.max(durationSeconds, 60), 3600);

  const policy = {
    version: '2.0',
    statement: [
      {
        action: [
          'name/cos:PutObject',
          'name/cos:PostObject',
          'name/cos:InitiateMultipartUpload',
          'name/cos:ListMultipartUploads',
          'name/cos:ListParts',
          'name/cos:UploadPart',
          'name/cos:CompleteMultipartUpload',
          'name/cos:AbortMultipartUpload',
        ],
        effect: 'allow',
        principal: { qcs: ['*'] },
        resource: [`qcs::cos:${region}:uid/${appId}:${bucket}/${allowPrefix}`],
      },
    ],
  };

  const data = await STS.getCredential({
    secretId,
    secretKey,
    durationSeconds: safeDuration,
    region,
    policy,
  });

  return {
    startTime: data.startTime,
    expiredTime: data.expiredTime,
    credentials: data.credentials,
    bucket,
    region,
    allowPrefix,
  };
}
