'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, Save, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';

type CosPublicConfig = {
  secretId: string;
  secretIdSet: boolean;
  secretKeySet: boolean;
  bucket: string;
  region: string;
  cdnDomain: string;
  thumbWidth: number;
  source: 'database' | 'env' | 'mixed';
  ready: boolean;
};

type TestResult = { ok: boolean; error?: string; bucket?: string; region?: string };

const REGION_OPTIONS = [
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

const SOURCE_LABEL: Record<CosPublicConfig['source'], string> = {
  env: '环境变量',
  database: '数据库',
  mixed: '混合（DB + env）',
};

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'save' | 'saveTest' | 'test' | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [meta, setMeta] = useState<Pick<
    CosPublicConfig,
    'secretId' | 'secretIdSet' | 'secretKeySet' | 'source' | 'ready'
  > | null>(null);

  // 表单：SecretKey 只在内存中，从不写入 localStorage
  const [secretId, setSecretId] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [bucket, setBucket] = useState('');
  const [region, setRegion] = useState('ap-hongkong');
  const [cdnDomain, setCdnDomain] = useState('');
  const [thumbWidth, setThumbWidth] = useState(480);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/settings/cos');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '读取配置失败');

      setMeta({
        secretId: data.secretId || '',
        secretIdSet: Boolean(data.secretIdSet),
        secretKeySet: Boolean(data.secretKeySet),
        source: data.source || 'env',
        ready: Boolean(data.ready),
      });
      setBucket(data.bucket || '');
      setRegion(data.region || 'ap-guangzhou');
      setCdnDomain(data.cdnDomain || '');
      setThumbWidth(Number(data.thumbWidth) || 480);
      // 密钥不回填明文；输入框保持空白
      setSecretId('');
      setSecretKey('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '读取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function buildPayload() {
    const payload: Record<string, unknown> = {
      bucket: bucket.trim(),
      region: region.trim(),
      cdnDomain: cdnDomain.trim(),
      thumbWidth: Number(thumbWidth) || 480,
    };
    const sid = secretId.trim();
    const skey = secretKey.trim();
    if (sid && !sid.includes('****')) payload.secretId = sid;
    if (skey && !skey.includes('****')) payload.secretKey = skey;
    return payload;
  }

  async function handleSave(withTest: boolean) {
    setBusy(withTest ? 'saveTest' : 'save');
    setError('');
    setSuccess('');
    setTestResult(null);

    try {
      if (!bucket.trim() || !region.trim()) {
        throw new Error('Bucket 与 Region 为必填');
      }

      const res = await fetch('/api/admin/settings/cos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...buildPayload(), test: withTest }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '保存失败');

      setMeta({
        secretId: data.secretId || '',
        secretIdSet: Boolean(data.secretIdSet),
        secretKeySet: Boolean(data.secretKeySet),
        source: data.source || 'database',
        ready: Boolean(data.ready),
      });
      setBucket(data.bucket || bucket);
      setRegion(data.region || region);
      setCdnDomain(data.cdnDomain ?? cdnDomain);
      setThumbWidth(Number(data.thumbWidth) || thumbWidth);
      // 保存成功后清空密钥输入，避免明文留在 state
      setSecretId('');
      setSecretKey('');

      if (withTest && data.test) {
        setTestResult(data.test as TestResult);
        if (data.test.ok) {
          setSuccess('已保存，连通性测试通过');
        } else {
          setSuccess('已保存');
          setError(data.test.error || '连通性测试失败');
        }
      } else {
        setSuccess('配置已保存，上传与签名将使用新配置');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(null);
    }
  }

  async function handleTestOnly() {
    setBusy('test');
    setError('');
    setSuccess('');
    setTestResult(null);

    try {
      const payload = buildPayload();
      const res = await fetch('/api/admin/settings/cos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as TestResult & { error?: string };
      setTestResult({ ok: Boolean(data.ok), error: data.error, bucket: data.bucket, region: data.region });
      if (data.ok) {
        setSuccess('连通性测试通过（未保存表单更改，除非已点保存）');
      } else {
        setError(data.error || '连通性测试失败');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '测试失败');
    } finally {
      setBusy(null);
      // 测试后也清空刚输入的密钥，降低停留内存时间
      setSecretKey('');
    }
  }

  if (loading) {
    return (
      <p className="text-center py-16 text-sm" style={{ color: 'var(--text-muted)' }}>
        加载配置中...
      </p>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">设置</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            腾讯云 COS · 数据库配置优先，未填项回退环境变量
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span
            className={cn(
              'px-2.5 py-1 rounded-lg glass',
              meta?.ready ? 'text-green-700' : 'text-amber-700'
            )}
          >
            {meta?.ready ? '就绪' : '未就绪'}
          </span>
          <span className="px-2.5 py-1 rounded-lg glass" style={{ color: 'var(--text-muted)' }}>
            来源：{meta ? SOURCE_LABEL[meta.source] : '—'}
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl glass px-4 py-3 text-sm text-red-600 flex items-start gap-2">
          <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && !error && (
        <div className="rounded-2xl glass px-4 py-3 text-sm text-green-700 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}
      {testResult && (
        <div
          className={cn(
            'rounded-2xl glass px-4 py-3 text-sm flex items-start gap-2',
            testResult.ok ? 'text-green-700' : 'text-red-600'
          )}
        >
          {testResult.ok ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          <span>
            {testResult.ok
              ? `headBucket 成功${testResult.bucket ? ` · ${testResult.bucket}` : ''}${
                  testResult.region ? ` @ ${testResult.region}` : ''
                }`
              : testResult.error || '测试失败'}
          </span>
        </div>
      )}

      <form
        className="rounded-3xl glass p-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave(false);
        }}
        autoComplete="off"
      >
        <div>
          <label className="block text-sm mb-1.5 font-medium">SecretId</label>
          <input
            className="input-glass font-mono text-sm"
            type="text"
            name="cos-secret-id"
            autoComplete="off"
            spellCheck={false}
            value={secretId}
            onChange={(e) => setSecretId(e.target.value)}
            placeholder={
              meta?.secretIdSet
                ? `已配置 ${meta.secretId || '****'}，留空不修改`
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
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            placeholder={
              meta?.secretKeySet ? '已配置则留空不修改' : '请输入 SecretKey'
            }
          />
          <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
            密钥仅保存在服务端（加密），不会回填明文，也不会写入浏览器本地存储
          </p>
        </div>

        <div>
          <label className="block text-sm mb-1.5 font-medium">Bucket</label>
          <input
            className="input-glass font-mono text-sm"
            value={bucket}
            onChange={(e) => setBucket(e.target.value)}
            placeholder="example-1250000000"
            required
          />
        </div>

        <div>
          <label className="block text-sm mb-1.5 font-medium">Region</label>
          <input
            className="input-glass font-mono text-sm"
            list="cos-region-list"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="ap-guangzhou"
            required
          />
          <datalist id="cos-region-list">
            {REGION_OPTIONS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
            常见：ap-guangzhou、ap-shanghai、ap-beijing、ap-chengdu
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {REGION_OPTIONS.slice(0, 6).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRegion(r)}
                className={cn(
                  'text-xs px-2 py-1 rounded-lg transition',
                  region === r ? 'bg-white/80 text-blue-600' : 'btn-ghost !py-1 !px-2'
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm mb-1.5 font-medium">CDN / 自定义域名</label>
          <input
            className="input-glass text-sm"
            value={cdnDomain}
            onChange={(e) => setCdnDomain(e.target.value)}
            placeholder="陈庆.我爱你（可选）"
          />
        </div>

        <div>
          <label className="block text-sm mb-1.5 font-medium">缩略图宽度</label>
          <input
            className="input-glass text-sm"
            type="number"
            min={120}
            max={1200}
            value={thumbWidth}
            onChange={(e) => setThumbWidth(Number(e.target.value) || 480)}
          />
          <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
            120–1200，默认 480（数据万象列表缩略图）
          </p>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="submit"
            disabled={Boolean(busy)}
            className="btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy === 'save' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            保存
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void handleSave(true)}
            className="btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy === 'saveTest' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FlaskConical className="w-4 h-4" />
            )}
            保存并测试
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void handleTestOnly()}
            className="btn-ghost text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy === 'test' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FlaskConical className="w-4 h-4" />
            )}
            仅测试
          </button>
        </div>
      </form>
    </div>
  );
}
