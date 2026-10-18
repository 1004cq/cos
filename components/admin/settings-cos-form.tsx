'use client';

import { CheckCircle2, FlaskConical, Loader2, Save, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  REGION_OPTIONS,
  type CosPublicConfig,
  type TestResult,
} from '@/components/admin/settings-types';

export type SettingsCosFormProps = {
  meta: Pick<
    CosPublicConfig,
    'secretId' | 'secretIdSet' | 'secretKeySet' | 'source' | 'ready' | 'cdnIgnoredUnsafe'
  > | null;
  busy: 'save' | 'saveTest' | 'test' | 'account' | null;
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
  cdnLooksChinese: boolean;
  onSecretId: (v: string) => void;
  onSecretKey: (v: string) => void;
  onBucket: (v: string) => void;
  onRegion: (v: string) => void;
  onCdnDomain: (v: string) => void;
  onThumbWidth: (v: number) => void;
  onWatermarkEnabled: (v: boolean) => void;
  onWatermarkText: (v: string) => void;
  onImageStyleThumb: (v: string) => void;
  onImageStyleFull: (v: string) => void;
  onSave: (andTest: boolean) => void;
  onTestOnly: () => void;
};

export function SettingsCosForm(p: SettingsCosFormProps) {
  return (
    <form
      className="rounded-3xl glass p-6 space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        p.onSave(false);
      }}
      autoComplete="off"
    >
      <h2 className="text-lg font-semibold">腾讯云 COS</h2>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        数据库配置优先。Bucket 需含 APPID（如 cq-1327876314）。香港桶 Region 填 ap-hongkong。
      </p>

      <div>
        <label className="block text-sm mb-1.5 font-medium">SecretId</label>
        <input
          className="input-glass font-mono text-sm"
          type="text"
          name="cos-secret-id"
          autoComplete="off"
          spellCheck={false}
          value={p.secretId}
          onChange={(e) => p.onSecretId(e.target.value)}
          placeholder={
            p.meta?.secretIdSet
              ? `已配置 ${p.meta.secretId || '****'}，留空不修改`
              : 'AKIDxxxxxxxx'
          }
        />
      </div>

      <div>
        <label className="block text-sm mb-1.5 font-medium">SecretKey</label>
        <input
          className="input-glass font-mono text-sm"
          type="password"
          name="cos-secret-key"
          autoComplete="new-password"
          value={p.secretKey}
          onChange={(e) => p.onSecretKey(e.target.value)}
          placeholder={p.meta?.secretKeySet ? '已配置则留空不修改' : '请输入 SecretKey'}
        />
        <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
          密钥仅保存在服务端（加密），不会回填明文，也不会写入浏览器本地存储
        </p>
      </div>

      <div>
        <label className="block text-sm mb-1.5 font-medium">Bucket</label>
        <input
          className="input-glass font-mono text-sm"
          value={p.bucket}
          onChange={(e) => p.onBucket(e.target.value)}
          placeholder="cq-1327876314"
          required
        />
      </div>

      <div>
        <label className="block text-sm mb-1.5 font-medium">Region</label>
        <input
          className="input-glass font-mono text-sm"
          list="cos-region-list"
          value={p.region}
          onChange={(e) => p.onRegion(e.target.value)}
          placeholder="ap-hongkong"
          required
        />
        <datalist id="cos-region-list">
          {REGION_OPTIONS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
          本站桶在香港：请填 ap-hongkong
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {REGION_OPTIONS.slice(0, 6).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => p.onRegion(r)}
              className={cn(
                'text-xs px-2 py-1 rounded-lg transition',
                p.region === r ? 'bg-white/80 text-blue-600' : 'btn-ghost !py-1 !px-2'
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <label className="block text-sm font-medium">CDN / 自定义域名</label>
          <button
            type="button"
            className="text-xs text-blue-600 hover:underline"
            onClick={() => p.onCdnDomain('')}
          >
            清空
          </button>
        </div>
        <input
          className="input-glass text-sm"
          value={p.cdnDomain}
          onChange={(e) => p.onCdnDomain(e.target.value)}
          placeholder="可留空（推荐）"
        />
        <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
          网站可用中文域；COS 文件走默认域名（如
          cq-1327876314.cos.ap-hongkong.myqcloud.com）。CDN
          仅英文且已绑到本桶时才填，切勿填「陈庆.我爱你」。
        </p>
        {(p.cdnLooksChinese || p.meta?.cdnIgnoredUnsafe) && (
          <p className="text-xs mt-2 text-amber-700">
            中文站域名不能当 COS CDN（运行时会忽略）。请点「清空」后保存。
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm mb-1.5 font-medium">缩略图宽度</label>
        <input
          className="input-glass text-sm"
          type="number"
          min={120}
          max={1200}
          value={p.thumbWidth}
          onChange={(e) => p.onThumbWidth(Number(e.target.value) || 480)}
        />
        <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
          120–1200，默认 480（数据万象列表缩略图）
        </p>
      </div>

      <div className="space-y-3 rounded-2xl glass p-4">
        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={p.watermarkEnabled}
            onChange={(e) => p.onWatermarkEnabled(e.target.checked)}
            className="rounded border-black/20"
          />
          展示链文字水印（可选）
        </label>
        <input
          className="input-glass text-sm"
          value={p.watermarkText}
          maxLength={40}
          disabled={!p.watermarkEnabled}
          onChange={(e) => p.onWatermarkText(e.target.value)}
          placeholder="陈庆.我爱你"
        />
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          开启后，图库/分享的缩略图与图片详情预览经数据万象叠加水印（参数签入签名）。
          管理端 /api/sign 原图下载不加。水印无法防录屏或截图。
        </p>
      </div>

      <div className="space-y-3 rounded-2xl glass p-4">
        <p className="text-sm font-medium">图片样式名（原图保护）</p>
        <p className="text-xs text-amber-800 bg-amber-50/80 rounded-xl px-3 py-2">
          若图片全部 403「please use style」，请到腾讯云数据万象关闭「原图保护」，
          或在控制台创建样式后把样式名填在下面（例如 thumb / full）。
        </p>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
            列表缩略样式名
          </label>
          <input
            className="input-glass text-sm"
            value={p.imageStyleThumb}
            onChange={(e) => p.onImageStyleThumb(e.target.value)}
            placeholder="如 thumb（可留空）"
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
            详情/全图样式名
          </label>
          <input
            className="input-glass text-sm"
            value={p.imageStyleFull}
            onChange={(e) => p.onImageStyleFull(e.target.value)}
            placeholder="如 full（可留空）"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <button
          type="submit"
          disabled={Boolean(p.busy)}
          className="btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {p.busy === 'save' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          保存
        </button>
        <button
          type="button"
          disabled={Boolean(p.busy)}
          onClick={() => p.onSave(true)}
          className="btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {p.busy === 'saveTest' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FlaskConical className="w-4 h-4" />
          )}
          保存并测试
        </button>
        <button
          type="button"
          disabled={Boolean(p.busy)}
          onClick={() => p.onTestOnly()}
          className="btn-ghost text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {p.busy === 'test' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FlaskConical className="w-4 h-4" />
          )}
          仅测试
        </button>
      </div>
    </form>
  );
}
