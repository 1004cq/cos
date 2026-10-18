'use client';

import { cn } from '@/lib/utils';
import {
  PROVIDER_OPTIONS,
  SOURCE_LABEL,
  type CosPublicConfig,
  type StorageProviderId,
} from '@/components/admin/settings-types';

type ProviderReadyMap = Record<StorageProviderId, boolean>;
type ProviderSourceMap = Record<StorageProviderId, CosPublicConfig['source'] | undefined>;

export function SettingsOverviewBar({
  provider,
  ready,
  source,
}: {
  provider: StorageProviderId;
  ready: boolean | undefined;
  source: CosPublicConfig['source'] | undefined;
}) {
  const label = provider === 's3' ? 'S3' : provider === 'oss' ? 'OSS' : 'COS';
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">设置</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          对象存储 · 管理员账号
        </p>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span
          className={cn(
            'px-2.5 py-1 rounded-lg glass',
            ready ? 'text-green-700' : 'text-amber-700'
          )}
        >
          {label} {ready ? '就绪' : '未就绪'}
        </span>
        <span className="px-2.5 py-1 rounded-lg glass" style={{ color: 'var(--text-muted)' }}>
          来源：{source ? SOURCE_LABEL[source] : '—'}
        </span>
      </div>
    </div>
  );
}

export function ProviderSwitcher({
  provider,
  onChange,
  readyMap,
}: {
  provider: StorageProviderId;
  onChange: (id: StorageProviderId) => void;
  readyMap: ProviderReadyMap;
}) {
  return (
    <div className="rounded-3xl glass p-5 sm:p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">存储厂商</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          切换或修改凭证后保存立即生效。COS 用数据万象；OSS 用图片处理缩略；S3
          无服务端处理时列表会降级。
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {PROVIDER_OPTIONS.map((opt) => {
          const selected = provider === opt.id;
          const ready = readyMap[opt.id];
          return (
            <button
              key={opt.id}
              type="button"
              disabled={!opt.enabled}
              onClick={() => onChange(opt.id)}
              className={cn(
                'rounded-2xl border-2 px-3 py-3.5 text-left transition',
                selected
                  ? 'border-blue-500 bg-blue-50/70 shadow-sm'
                  : 'border-transparent glass hover:bg-white/50',
                !opt.enabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{opt.label}</p>
                <span
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-md',
                    ready ? 'bg-green-100 text-green-700' : 'bg-black/5 text-black/40'
                  )}
                >
                  {ready ? '就绪' : '未就绪'}
                </span>
              </div>
              <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                {opt.hint}
              </p>
              {!ready && opt.enabled ? (
                <p className="text-[11px] mt-2 text-black/35">尚未完成必填配置</p>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ProviderTabs({
  provider,
  onChange,
}: {
  provider: StorageProviderId;
  onChange: (id: StorageProviderId) => void;
}) {
  return (
    <div
      className="flex gap-1 p-1 rounded-2xl glass overflow-x-auto"
      role="tablist"
      aria-label="存储厂商配置"
    >
      {PROVIDER_OPTIONS.map((opt) => {
        const selected = provider === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={!opt.enabled}
            onClick={() => onChange(opt.id)}
            className={cn(
              'flex-1 min-w-[7.5rem] rounded-xl px-3 py-2.5 text-sm font-medium transition whitespace-nowrap',
              selected
                ? 'bg-white/90 text-blue-700 shadow-sm'
                : 'hover:bg-white/40',
              !opt.enabled && 'opacity-50 cursor-not-allowed'
            )}
            style={!selected ? { color: 'var(--text-muted)' } : undefined}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export type { ProviderReadyMap, ProviderSourceMap };
