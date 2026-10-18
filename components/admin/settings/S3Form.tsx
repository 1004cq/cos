'use client';

import { S3_REGION_HINTS } from '@/components/admin/settings-types';
import {
  CollapsibleSection,
  FieldHint,
  FieldLabel,
  SectionCard,
  TwoCol,
} from '@/components/admin/settings/ui';

export type S3FormValues = {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  endpoint: string;
  forcePathStyle: boolean;
  cdnDomain: string;
  publicBaseUrl: string;
};

export type S3FormMeta = {
  accessKeyId: string;
  accessKeyIdSet: boolean;
  secretAccessKeySet: boolean;
} | null;

type Props = {
  values: S3FormValues;
  meta: S3FormMeta;
  onChange: <K extends keyof S3FormValues>(key: K, value: S3FormValues[K]) => void;
};

export function S3Form({ values, meta, onChange }: Props) {
  return (
    <div className="space-y-4" role="tabpanel" aria-label="S3 兼容">
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        适用于 AWS S3、Cloudflare R2、MinIO 等。R2 请填 Endpoint，Region 常用 auto；MinIO 建议开启
        Path-Style。无服务端缩略图/水印，列表将签原图或已有海报。
      </p>

      <SectionCard title="基础信息" description="Bucket 为必填项">
        <TwoCol>
          <div>
            <FieldLabel required>Bucket</FieldLabel>
            <input
              className="input-glass font-mono text-sm"
              value={values.bucket}
              onChange={(e) => onChange('bucket', e.target.value)}
              placeholder="my-bucket"
              required
            />
          </div>
          <div>
            <FieldLabel>Region</FieldLabel>
            <input
              className="input-glass font-mono text-sm"
              list="s3-region-list"
              value={values.region}
              onChange={(e) => onChange('region', e.target.value)}
              placeholder="auto"
            />
            <datalist id="s3-region-list">
              {S3_REGION_HINTS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
        </TwoCol>
      </SectionCard>

      <SectionCard
        title="访问凭证"
        description={
          meta?.accessKeyIdSet || meta?.secretAccessKeySet
            ? '已设置密钥时留空不修改'
            : '首次配置需填写 Access Key'
        }
      >
        <TwoCol>
          <div>
            <FieldLabel>Access Key ID</FieldLabel>
            <input
              className="input-glass font-mono text-sm"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={values.accessKeyId}
              onChange={(e) => onChange('accessKeyId', e.target.value)}
              placeholder={
                meta?.accessKeyIdSet
                  ? `已配置 ${meta.accessKeyId || '****'}，留空不修改`
                  : 'AKIA… / R2 Access Key'
              }
            />
          </div>
          <div>
            <FieldLabel>Secret Access Key</FieldLabel>
            <input
              className="input-glass font-mono text-sm"
              type="password"
              autoComplete="new-password"
              value={values.secretAccessKey}
              onChange={(e) => onChange('secretAccessKey', e.target.value)}
              placeholder={
                meta?.secretAccessKeySet ? '已配置则留空不修改' : 'Secret Access Key'
              }
            />
          </div>
        </TwoCol>
      </SectionCard>

      <CollapsibleSection
        title="高级选项"
        description="Endpoint、Path-Style、CDN 与 Public Base URL"
        defaultOpen={Boolean(values.endpoint || values.forcePathStyle || values.publicBaseUrl)}
      >
        <div>
          <FieldLabel>Endpoint</FieldLabel>
          <input
            className="input-glass font-mono text-sm"
            value={values.endpoint}
            onChange={(e) => onChange('endpoint', e.target.value)}
            placeholder="https://xxx.r2.cloudflarestorage.com"
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={values.forcePathStyle}
            onChange={(e) => onChange('forcePathStyle', e.target.checked)}
          />
          Force Path Style（MinIO 等常需开启）
        </label>
        <TwoCol>
          <div>
            <FieldLabel>CDN / 公共域名</FieldLabel>
            <input
              className="input-glass text-sm"
              value={values.cdnDomain}
              onChange={(e) => onChange('cdnDomain', e.target.value)}
              placeholder="cdn.example.com"
            />
          </div>
          <div>
            <FieldLabel>Public Base URL</FieldLabel>
            <input
              className="input-glass text-sm"
              value={values.publicBaseUrl}
              onChange={(e) => onChange('publicBaseUrl', e.target.value)}
              placeholder="https://pub-xxx.r2.dev"
            />
            <FieldHint>公开读桶可填，用于直链访问</FieldHint>
          </div>
        </TwoCol>
      </CollapsibleSection>
    </div>
  );
}
