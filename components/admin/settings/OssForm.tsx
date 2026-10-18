'use client';

import { OSS_REGION_HINTS } from '@/components/admin/settings-types';
import {
  CollapsibleSection,
  FieldHint,
  FieldLabel,
  SectionCard,
  TwoCol,
} from '@/components/admin/settings/ui';

export type OssFormValues = {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  endpoint: string;
  cname: boolean;
  cdnDomain: string;
  publicBaseUrl: string;
  thumbWidth: number;
  watermarkEnabled: boolean;
  watermarkText: string;
};

export type OssFormMeta = {
  accessKeyId: string;
  accessKeyIdSet: boolean;
  accessKeySecretSet: boolean;
} | null;

type Props = {
  values: OssFormValues;
  meta: OssFormMeta;
  onChange: <K extends keyof OssFormValues>(key: K, value: OssFormValues[K]) => void;
};

export function OssForm({ values, meta, onChange }: Props) {
  return (
    <div className="space-y-4" role="tabpanel" aria-label="阿里云 OSS">
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Region 形如 oss-cn-hangzhou。缩略图走 OSS 图片处理（x-oss-process）；可选文字水印。自定义域名可填
        Endpoint 并开启 CNAME。
      </p>

      <SectionCard title="基础信息" description="Bucket 与 Region 为必填项">
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
            <FieldLabel required>Region</FieldLabel>
            <input
              className="input-glass font-mono text-sm"
              list="oss-region-list"
              value={values.region}
              onChange={(e) => onChange('region', e.target.value)}
              placeholder="oss-cn-hangzhou"
              required
            />
            <datalist id="oss-region-list">
              {OSS_REGION_HINTS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
        </TwoCol>
      </SectionCard>

      <SectionCard
        title="访问凭证"
        description={
          meta?.accessKeyIdSet || meta?.accessKeySecretSet
            ? '已设置密钥时留空不修改'
            : '首次配置需填写 AccessKey'
        }
      >
        <TwoCol>
          <div>
            <FieldLabel>AccessKey ID</FieldLabel>
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
                  : 'LTAI…'
              }
            />
          </div>
          <div>
            <FieldLabel>AccessKey Secret</FieldLabel>
            <input
              className="input-glass font-mono text-sm"
              type="password"
              autoComplete="new-password"
              value={values.accessKeySecret}
              onChange={(e) => onChange('accessKeySecret', e.target.value)}
              placeholder={
                meta?.accessKeySecretSet ? '已配置则留空不修改' : 'AccessKey Secret'
              }
            />
          </div>
        </TwoCol>
      </SectionCard>

      <CollapsibleSection
        title="高级选项"
        description="Endpoint、CNAME、CDN、缩略图与水印"
        defaultOpen={Boolean(
          values.endpoint || values.cname || values.watermarkEnabled || values.cdnDomain
        )}
      >
        <div>
          <FieldLabel>Endpoint</FieldLabel>
          <input
            className="input-glass font-mono text-sm"
            value={values.endpoint}
            onChange={(e) => onChange('endpoint', e.target.value)}
            placeholder="oss-cn-hangzhou.aliyuncs.com 或自定义域名"
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={values.cname}
            onChange={(e) => onChange('cname', e.target.checked)}
          />
          Endpoint 为自定义 / CDN 域名（CNAME）
        </label>
        <TwoCol>
          <div>
            <FieldLabel>CDN 域名</FieldLabel>
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
              placeholder="https://cdn.example.com"
            />
          </div>
        </TwoCol>
        <div>
          <FieldLabel>缩略图宽度</FieldLabel>
          <input
            className="input-glass text-sm"
            type="number"
            min={120}
            max={1200}
            value={values.thumbWidth}
            onChange={(e) => onChange('thumbWidth', Number(e.target.value) || 480)}
          />
          <FieldHint>120–1200，默认 480（OSS image/resize）</FieldHint>
        </div>
        <div className="space-y-3 rounded-2xl glass p-4">
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={values.watermarkEnabled}
              onChange={(e) => onChange('watermarkEnabled', e.target.checked)}
              className="rounded border-black/20"
            />
            展示链文字水印
          </label>
          <input
            className="input-glass text-sm"
            value={values.watermarkText}
            maxLength={40}
            disabled={!values.watermarkEnabled}
            onChange={(e) => onChange('watermarkText', e.target.value)}
            placeholder="Gallery"
          />
          <FieldHint className="!mt-0">
            开启后经 OSS 图片处理叠加水印（需桶开通图片处理）。
          </FieldHint>
        </div>
      </CollapsibleSection>
    </div>
  );
}
