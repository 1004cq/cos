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

export type TestResult = { ok: boolean; error?: string; bucket?: string; region?: string };

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

export const SOURCE_LABEL: Record<CosPublicConfig['source'], string> = {
  env: '环境变量',
  database: '数据库',
  mixed: '混合（DB + env）',
};

export function hasNonAscii(s: string) {
  return /[^\x00-\x7F]/.test(s);
}
