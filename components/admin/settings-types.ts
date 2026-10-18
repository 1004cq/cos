export type StorageProviderId = 'cos' | 's3' | 'oss';

export type CosPublicConfig = {
  secretId: string;
  secretIdSet: boolean;
  secretKeySet: boolean;
  bucket: string;
  region: string;
  cdnDomain: string;
  cdnDomainEffective?: string;
  cdnIgnoredUnsafe?: boolean;
  thumbWidth: number;
  watermarkEnabled?: boolean;
  watermarkText?: string;
  imageStyleThumb?: string;
  imageStyleFull?: string;
  source: 'database' | 'env' | 'mixed';
  ready: boolean;
};

export type S3PublicConfig = {
  accessKeyId: string;
  accessKeyIdSet: boolean;
  secretAccessKeySet: boolean;
  bucket: string;
  region: string;
  endpoint: string;
  forcePathStyle: boolean;
  cdnDomain: string;
  publicBaseUrl: string;
  source: 'database' | 'env' | 'mixed';
  ready: boolean;
};

export type StoragePublicConfig = CosPublicConfig & {
  provider: StorageProviderId;
  cos?: CosPublicConfig;
  s3?: S3PublicConfig;
};

export type TestResult = {
  ok: boolean;
  error?: string;
  detail?: string;
  bucket?: string;
  region?: string;
  endpoint?: string;
  provider?: StorageProviderId;
};

export const PROVIDER_OPTIONS: {
  id: StorageProviderId;
  label: string;
  hint: string;
  enabled: boolean;
}[] = [
  {
    id: 'cos',
    label: '腾讯云 COS',
    hint: '数据万象缩略图 / 水印 / 样式 / STS',
    enabled: true,
  },
  {
    id: 's3',
    label: 'S3 兼容',
    hint: '无服务端缩略：列表用封面海报或占位',
    enabled: true,
  },
  {
    id: 'oss',
    label: '阿里云 OSS',
    hint: '即将支持（扩展位）',
    enabled: false,
  },
];

export const REGION_OPTIONS = [
  'ap-hongkong',
  'ap-guangzhou',
  'ap-shanghai',
  'ap-nanjing',
  'ap-beijing',
  'ap-chengdu',
  'ap-chongqing',
  'ap-singapore',
  'ap-tokyo',
  'na-siliconvalley',
] as const;

export const S3_REGION_HINTS = [
  'auto',
  'us-east-1',
  'ap-northeast-1',
  'ap-southeast-1',
  'eu-west-1',
] as const;

export const SOURCE_LABEL: Record<CosPublicConfig['source'], string> = {
  env: '环境变量',
  database: '数据库',
  mixed: '混合（DB + env）',
};

export function hasNonAscii(s: string) {
  return /[^\x00-\x7F]/.test(s);
}
