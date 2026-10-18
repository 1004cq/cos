'use client';

import { REGION_OPTIONS, hasNonAscii } from '@/components/admin/settings-types';
import { cn } from '@/lib/utils';
import {
  CollapsibleSection,
  FieldHint,
  FieldLabel,
  SectionCard,
  TwoCol,
} from '@/components/admin/settings/ui';

export type CosFormValues = {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  cdnDomain: string;
  thumbWidth: number;
  watermarkEnabled: boolean;
  watermarkText: string;
  imageStyleThumb: string;
  imageStyleFull: string;
};

export type CosFormMeta = {
  secretId: string;
  secretIdSet: boolean;
  secretKeySet: boolean;
  cdnIgnoredUnsafe?: boolean;
} | null;

type Props = {
  values: CosFormValues;
  meta: CosFormMeta;
  onChange: <K extends keyof CosFormValues>(key: K, value: CosFormValues[K]) => void;
};

export function CosForm({ values, meta, onChange }: Props) {
  const cdnLooksChinese = hasNonAscii(values.cdnDomain);

  return (
    <div className="space-y-4" role="tabpanel" aria-label="腾讯云 COS">
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        数据库配置优先。Bucket 需含 APPID（如 your-bucket-1250000000）。香港桶 Region 填
        ap-hongkong。
      </p>

      <SectionCard title="基础信息" description="Bucket 与 Region 为必填项">
        <TwoCol>
          <div>
            <FieldLabel required>Bucket</FieldLabel>
            <input
              className="input-glass font-mono text-sm"
              value={values.bucket}
              onChange={(e) => onChange('bucket', e.target.value)}
              placeholder="your-bucket-1250000000"
              required
            />
          </div>
          <div>
            <FieldLabel required>Region</FieldLabel>
            <input
              className="input-glass font-mono text-sm"
              list="cos-region-list"
              value={values.region}
              onChange={(e) => onChange('region', e.target.value)}
              placeholder="ap-hongkong"
              required
            />
            <datalist id="cos-region-list">
              {REGION_OPTIONS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
            <FieldHint>本站桶在香港：请填 ap-hongkong</FieldHint>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {REGION_OPTIONS.slice(0, 6).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onChange('region', r)}
                  className={cn(
                    'text-xs px-2 py-1 rounded-lg transition',
                    values.region === r ? 'bg-white/80 text-blue-600' : 'btn-ghost !py-1 !px-2'
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </TwoCol>
      </SectionCard>

      <SectionCard
        title="访问凭证"
        description={
          meta?.secretIdSet || meta?.secretKeySet
            ? '已设置密钥时留空不修改；明文不会回填'
            : '首次配置需填写 SecretId / SecretKey'
        }
      >
        <TwoCol>
          <div>
            <FieldLabel>SecretId</FieldLabel>
            <input
              className="input-glass font-mono text-sm"
              type="text"
              name="cos-secret-id"
              autoComplete="off"
              spellCheck={false}
              value={values.secretId}
              onChange={(e) => onChange('secretId', e.target.value)}
              placeholder={
                meta?.secretIdSet
                  ? `已配置 ${meta.secretId || '****'}，留空不修改`
                  : 'AKIDxxxxxxxx'
              }
            />
          </div>
          <div>
            <FieldLabel>SecretKey</FieldLabel>
            <input
              className="input-glass font-mono text-sm"
              type="password"
              name="cos-secret-key"
              autoComplete="new-password"
              value={values.secretKey}
              onChange={(e) => onChange('secretKey', e.target.value)}
              placeholder={meta?.secretKeySet ? '已配置则留空不修改' : '请输入 SecretKey'}
            />
            <FieldHint>密钥仅保存在服务端（加密），不会写入浏览器本地存储</FieldHint>
          </div>
        </TwoCol>
      </SectionCard>

      <CollapsibleSection
        title="高级选项"
        description="CDN、缩略图、水印与数据万象样式"
        defaultOpen={Boolean(values.cdnDomain || values.watermarkEnabled || values.imageStyleThumb)}
      >
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <FieldLabel className="!mb-0">CDN / 自定义域名</FieldLabel>
            <button
              type="button"
              className="text-xs text-blue-600 hover:underline"
              onClick={() => onChange('cdnDomain', '')}
            >
              清空
            </button>
          </div>
          <input
            className="input-glass text-sm"
            value={values.cdnDomain}
            onChange={(e) => onChange('cdnDomain', e.target.value)}
            placeholder="可留空（推荐）"
          />
          <FieldHint>
            网站可用中文域；COS 文件走默认域名。CDN 仅英文且已绑到本桶时才填，切勿填中文站域名。
          </FieldHint>
          {(cdnLooksChinese || meta?.cdnIgnoredUnsafe) && (
            <p className="text-xs mt-2 text-amber-700">
              中文站域名不能当 COS CDN（运行时会忽略）。请点「清空」后保存。
            </p>
          )}
        </div>

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
          <FieldHint>120–1200，默认 480（数据万象列表缩略图）</FieldHint>
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
            开启后图库/分享预览经数据万象叠加水印；管理端原图下载不加。
          </FieldHint>
        </div>

        <div className="space-y-3 rounded-2xl glass p-4">
          <p className="text-sm font-medium">数据万象样式（原图保护）</p>
          <p className="text-xs text-amber-800 bg-amber-50/80 rounded-xl px-3 py-2">
            若图片全部 403「please use style」，请到腾讯云关闭「原图保护」，或在控制台创建样式后填入下方样式名。
          </p>
          <TwoCol>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                列表缩略样式名（imageStyleThumb）
              </label>
              <input
                className="input-glass text-sm"
                value={values.imageStyleThumb}
                onChange={(e) => onChange('imageStyleThumb', e.target.value)}
                placeholder="如 thumb（可留空）"
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                详情/全图样式名（imageStyleFull）
              </label>
              <input
                className="input-glass text-sm"
                value={values.imageStyleFull}
                onChange={(e) => onChange('imageStyleFull', e.target.value)}
                placeholder="如 full（可留空）"
              />
            </div>
          </TwoCol>
        </div>
      </CollapsibleSection>
    </div>
  );
}
