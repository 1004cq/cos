'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { CheckCircle2, XCircle, Loader2, Save, FlaskConical, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PROVIDER_OPTIONS,
  REGION_OPTIONS,
  S3_REGION_HINTS,
  SOURCE_LABEL,
  hasNonAscii,
  type CosPublicConfig,
  type S3PublicConfig,
  type StorageProviderId,
  type TestResult,
} from '@/components/admin/settings-types';

export default function AdminSettingsPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'save' | 'saveTest' | 'test' | 'account' | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [meta, setMeta] = useState<Pick<
    CosPublicConfig,
    'secretId' | 'secretIdSet' | 'secretKeySet' | 'source' | 'ready' | 'cdnIgnoredUnsafe'
  > | null>(null);

  const [secretId, setSecretId] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [bucket, setBucket] = useState('');
  const [region, setRegion] = useState('ap-hongkong');
  const [cdnDomain, setCdnDomain] = useState('');
  const [thumbWidth, setThumbWidth] = useState(480);
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [watermarkText, setWatermarkText] = useState('Gallery');
  const [imageStyleThumb, setImageStyleThumb] = useState('');
  const [imageStyleFull, setImageStyleFull] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const [provider, setProvider] = useState<StorageProviderId>('cos');
  const [s3AccessKeyId, setS3AccessKeyId] = useState('');
  const [s3SecretAccessKey, setS3SecretAccessKey] = useState('');
  const [s3Bucket, setS3Bucket] = useState('');
  const [s3Region, setS3Region] = useState('auto');
  const [s3Endpoint, setS3Endpoint] = useState('');
  const [s3ForcePathStyle, setS3ForcePathStyle] = useState(false);
  const [s3CdnDomain, setS3CdnDomain] = useState('');
  const [s3PublicBaseUrl, setS3PublicBaseUrl] = useState('');
  const [s3Meta, setS3Meta] = useState<Pick<
    S3PublicConfig,
    'accessKeyId' | 'accessKeyIdSet' | 'secretAccessKeySet' | 'source' | 'ready'
  > | null>(null);

  const [accountUsername, setAccountUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [accountError, setAccountError] = useState('');
  const [accountSuccess, setAccountSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [res, accRes] = await Promise.all([
        fetch('/api/admin/settings/cos'),
        fetch('/api/admin/account'),
      ]);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '读取配置失败');

      const cos = data.cos || data;
      const s3 = data.s3 || {};
      setProvider((data.provider as StorageProviderId) || 'cos');
      setMeta({
        secretId: cos.secretId || '',
        secretIdSet: Boolean(cos.secretIdSet),
        secretKeySet: Boolean(cos.secretKeySet),
        source: cos.source || 'env',
        ready: Boolean(cos.ready),
        cdnIgnoredUnsafe: Boolean(cos.cdnIgnoredUnsafe),
      });
      setBucket(cos.bucket || '');
      setRegion(cos.region || 'ap-hongkong');
      setCdnDomain(cos.cdnDomain || '');
      setThumbWidth(Number(cos.thumbWidth) || 480);
      setWatermarkEnabled(Boolean(cos.watermarkEnabled));
      setWatermarkText(cos.watermarkText || 'Gallery');
      setImageStyleThumb(cos.imageStyleThumb || '');
      setImageStyleFull(cos.imageStyleFull || '');
      setSecretId('');
      setSecretKey('');

      setS3Meta({
        accessKeyId: s3.accessKeyId || '',
        accessKeyIdSet: Boolean(s3.accessKeyIdSet),
        secretAccessKeySet: Boolean(s3.secretAccessKeySet),
        source: s3.source || 'env',
        ready: Boolean(s3.ready),
      });
      setS3Bucket(s3.bucket || '');
      setS3Region(s3.region || 'auto');
      setS3Endpoint(s3.endpoint || '');
      setS3ForcePathStyle(Boolean(s3.forcePathStyle));
      setS3CdnDomain(s3.cdnDomain || '');
      setS3PublicBaseUrl(s3.publicBaseUrl || '');
      setS3AccessKeyId('');
      setS3SecretAccessKey('');

      if (accRes.ok) {
        const acc = await accRes.json();
        setAccountUsername(acc.username || session?.user?.name || '');
      } else {
        setAccountUsername(session?.user?.name || '');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '读取失败');
    } finally {
      setLoading(false);
    }
  }, [session?.user?.name]);

  useEffect(() => {
    void load();
  }, [load]);

  function buildSaveBody() {
    if (provider === 's3') {
      const s3: Record<string, unknown> = {
        bucket: s3Bucket.trim(),
        region: s3Region.trim() || 'auto',
        endpoint: s3Endpoint.trim(),
        forcePathStyle: s3ForcePathStyle,
        cdnDomain: s3CdnDomain.trim(),
        publicBaseUrl: s3PublicBaseUrl.trim(),
      };
      const ak = s3AccessKeyId.trim();
      const sk = s3SecretAccessKey.trim();
      if (ak && !ak.includes('****')) s3.accessKeyId = ak;
      if (sk && !sk.includes('****')) s3.secretAccessKey = sk;
      return { provider: 's3' as const, s3 };
    }

    let cdn = cdnDomain.trim();
    if (hasNonAscii(cdn) || /xn--/i.test(cdn)) cdn = '';
    const cos: Record<string, unknown> = {
      bucket: bucket.trim(),
      region: region.trim(),
      cdnDomain: cdn,
      thumbWidth: Number(thumbWidth) || 480,
      watermarkEnabled,
      watermarkText: watermarkText.trim() || 'Gallery',
      imageStyleThumb: imageStyleThumb.trim(),
      imageStyleFull: imageStyleFull.trim(),
    };
    const sid = secretId.trim();
    const skey = secretKey.trim();
    if (sid && !sid.includes('****')) cos.secretId = sid;
    if (skey && !skey.includes('****')) cos.secretKey = skey;
    return { provider: 'cos' as const, cos };
  }

  async function handleSave(withTest: boolean) {
    setBusy(withTest ? 'saveTest' : 'save');
    setError('');
    setSuccess('');
    setTestResult(null);

    try {
      if (provider === 'oss') {
        throw new Error('阿里云 OSS 尚未实现，请选择腾讯云 COS 或 S3 兼容');
      }
      if (provider === 's3') {
        if (!s3Bucket.trim()) throw new Error('Bucket 为必填');
      } else if (!bucket.trim() || !region.trim()) {
        throw new Error('Bucket 与 Region 为必填');
      }

      const body = { ...buildSaveBody(), test: withTest };
      const res = await fetch('/api/admin/settings/cos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '保存失败');

      setProvider((data.provider as StorageProviderId) || provider);
      const cos = data.cos || data;
      const s3 = data.s3 || {};
      setMeta({
        secretId: cos.secretId || '',
        secretIdSet: Boolean(cos.secretIdSet),
        secretKeySet: Boolean(cos.secretKeySet),
        source: cos.source || 'database',
        ready: Boolean(data.ready ?? cos.ready),
        cdnIgnoredUnsafe: Boolean(cos.cdnIgnoredUnsafe),
      });
      setBucket(cos.bucket || bucket);
      setRegion(cos.region || region);
      setCdnDomain(cos.cdnDomain ?? '');
      setThumbWidth(Number(cos.thumbWidth) || thumbWidth);
      setWatermarkEnabled(Boolean(cos.watermarkEnabled));
      setWatermarkText(cos.watermarkText || watermarkText);
      setImageStyleThumb(cos.imageStyleThumb || '');
      setImageStyleFull(cos.imageStyleFull || '');
      setSecretId('');
      setSecretKey('');
      setS3Meta({
        accessKeyId: s3.accessKeyId || '',
        accessKeyIdSet: Boolean(s3.accessKeyIdSet),
        secretAccessKeySet: Boolean(s3.secretAccessKeySet),
        source: s3.source || 'database',
        ready: Boolean(s3.ready),
      });
      setS3Bucket(s3.bucket || s3Bucket);
      setS3Region(s3.region || s3Region);
      setS3Endpoint(s3.endpoint || '');
      setS3ForcePathStyle(Boolean(s3.forcePathStyle));
      setS3CdnDomain(s3.cdnDomain || '');
      setS3PublicBaseUrl(s3.publicBaseUrl || '');
      setS3AccessKeyId('');
      setS3SecretAccessKey('');

      if (withTest && data.test) {
        setTestResult(data.test as TestResult);
        if (data.test.ok) setSuccess('已保存并立即生效，连通性测试通过');
        else {
          setSuccess('已保存并立即生效');
          setError(data.test.error || '连通性测试失败');
        }
      } else {
        setSuccess('配置已保存并立即生效');
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
      const body = { ...buildSaveBody(), provider };
      const res = await fetch('/api/admin/settings/cos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          ...(provider === 's3' ? body.s3 : body.cos),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as TestResult & { error?: string };
      setTestResult({
        ok: Boolean(data.ok),
        error: data.error,
        detail: data.detail,
        bucket: data.bucket,
        region: data.region,
        endpoint: data.endpoint,
        provider: data.provider,
      });
      if (data.ok) setSuccess('连通性测试通过（未保存表单更改，除非已点保存）');
      else setError(data.error || '连通性测试失败');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '测试失败');
    } finally {
      setBusy(null);
      setSecretKey('');
      setS3SecretAccessKey('');
    }
  }

  async function handleAccountSave(e: React.FormEvent) {
    e.preventDefault();
    setAccountError('');
    setAccountSuccess('');

    if (!currentPassword) {
      setAccountError('请输入当前密码');
      return;
    }
    if (newPassword && newPassword.length < 12) {
      setAccountError('新密码至少 12 位');
      return;
    }
    if (newPassword && newPassword !== newPassword2) {
      setAccountError('两次输入的新密码不一致');
      return;
    }

    const payload: Record<string, string> = { currentPassword };
    if (newPassword) payload.newPassword = newPassword;
    if (accountUsername.trim()) payload.newUsername = accountUsername.trim();

    if (!payload.newPassword && !payload.newUsername) {
      setAccountError('请填写新密码或修改用户名');
      return;
    }

    setBusy('account');
    try {
      const res = await fetch('/api/admin/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '更新失败');

      setCurrentPassword('');
      setNewPassword('');
      setNewPassword2('');

      if (data.requireReLogin) {
        setAccountSuccess('已更新，请使用新凭据重新登录');
        setTimeout(() => {
          void signOut({ callbackUrl: '/admin/login' });
        }, 1200);
      } else {
        setAccountSuccess('已保存');
      }
    } catch (err: unknown) {
      setAccountError(err instanceof Error ? err.message : '更新失败');
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <p className="text-center py-16 text-sm" style={{ color: 'var(--text-muted)' }}>
        加载配置中...
      </p>
    );
  }

  const cdnLooksChinese = hasNonAscii(cdnDomain);

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">设置</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            账号安全 · 对象存储（COS / S3）
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span
            className={cn(
              'px-2.5 py-1 rounded-lg glass',
              meta?.ready ? 'text-green-700' : 'text-amber-700'
            )}
          >
            {provider === 's3' ? 'S3' : 'COS'} {(provider === 's3' ? s3Meta?.ready : meta?.ready) ? '就绪' : '未就绪'}
          </span>
          <span className="px-2.5 py-1 rounded-lg glass" style={{ color: 'var(--text-muted)' }}>
            来源：{meta ? SOURCE_LABEL[meta.source] : '—'}
          </span>
        </div>
      </div>

      <form
        onSubmit={handleAccountSave}
        className="rounded-3xl glass p-6 space-y-5"
        autoComplete="off"
      >
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold">管理员账号</h2>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          修改需验证当前密码；新密码至少 12 位，仅存 bcrypt 哈希。改密或改用户名后需重新登录。
        </p>
        <div>
          <label className="block text-sm mb-1.5 font-medium">用户名</label>
          <input
            className="input-glass text-sm"
            type="text"
            name="account-username"
            autoComplete="username"
            value={accountUsername}
            onChange={(e) => setAccountUsername(e.target.value)}
            maxLength={32}
          />
        </div>
        <div>
          <label className="block text-sm mb-1.5 font-medium">当前密码</label>
          <input
            className="input-glass text-sm"
            type="password"
            name="current-password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm mb-1.5 font-medium">新密码（可选）</label>
          <input
            className="input-glass text-sm"
            type="password"
            name="new-password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="至少 12 位，留空则不改密码"
          />
        </div>
        <div>
          <label className="block text-sm mb-1.5 font-medium">确认新密码</label>
          <input
            className="input-glass text-sm"
            type="password"
            name="new-password2"
            autoComplete="new-password"
            value={newPassword2}
            onChange={(e) => setNewPassword2(e.target.value)}
            placeholder="再次输入新密码"
            disabled={!newPassword}
          />
        </div>
        {accountError && (
          <div className="rounded-2xl glass px-4 py-3 text-sm text-red-600 flex items-start gap-2">
            <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{accountError}</span>
          </div>
        )}
        {accountSuccess && !accountError && (
          <div className="rounded-2xl glass px-4 py-3 text-sm text-green-700 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{accountSuccess}</span>
          </div>
        )}
        <button
          type="submit"
          disabled={busy === 'account'}
          className="btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {busy === 'account' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          保存账号
        </button>
      </form>

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
              ? testResult.provider === 's3'
                ? `S3 连通正常${testResult.detail ? ` · ${testResult.detail}` : testResult.bucket ? ` · ${testResult.bucket}` : ''}`
                : `headBucket 成功${testResult.bucket ? ` · ${testResult.bucket}` : ''}${
                    testResult.region ? ` @ ${testResult.region}` : ''
                  }`
              : testResult.error || '测试失败'}
          </span>
        </div>
      )}

      <div className="rounded-3xl glass p-6 space-y-4">
        <h2 className="text-lg font-semibold">存储厂商</h2>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          切换或修改凭证后保存立即生效（进程内缓存会清空）。S3
          无数据万象：图库列表优先用封面海报，否则显示占位，不会用原图铺满网格。
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {PROVIDER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={!opt.enabled}
              onClick={() => setProvider(opt.id)}
              className={cn(
                'rounded-2xl border px-3 py-3 text-left transition',
                provider === opt.id
                  ? 'border-blue-500 bg-white/80'
                  : 'border-transparent glass hover:bg-white/50',
                !opt.enabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              <p className="text-sm font-medium">{opt.label}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {opt.hint}
              </p>
            </button>
          ))}
        </div>
      </div>

      <form
        className="rounded-3xl glass p-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave(false);
        }}
        autoComplete="off"
      >
        <h2 className="text-lg font-semibold">
          {provider === 's3' ? 'S3 兼容存储' : '腾讯云 COS'}
        </h2>
        {provider === 's3' ? (
          <>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              适用于 AWS S3、Cloudflare R2、MinIO 等。R2 请填 Endpoint，Region 常用 auto；MinIO 建议开启
              Path-Style。无服务端缩略时，上传会尽量生成小封面（poster）；列表只用封面或占位，灯箱再加载原图。
            </p>
            <div>
              <label className="block text-sm mb-1.5 font-medium">Access Key ID</label>
              <input
                className="input-glass font-mono text-sm"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={s3AccessKeyId}
                onChange={(e) => setS3AccessKeyId(e.target.value)}
                placeholder={
                  s3Meta?.accessKeyIdSet
                    ? `已配置 ${s3Meta.accessKeyId || '****'}，留空不修改`
                    : 'AKIA… / R2 Access Key'
                }
              />
            </div>
            <div>
              <label className="block text-sm mb-1.5 font-medium">Secret Access Key</label>
              <input
                className="input-glass font-mono text-sm"
                type="password"
                autoComplete="new-password"
                value={s3SecretAccessKey}
                onChange={(e) => setS3SecretAccessKey(e.target.value)}
                placeholder={s3Meta?.secretAccessKeySet ? '已配置则留空不修改' : 'Secret Access Key'}
              />
            </div>
            <div>
              <label className="block text-sm mb-1.5 font-medium">Bucket</label>
              <input
                className="input-glass font-mono text-sm"
                value={s3Bucket}
                onChange={(e) => setS3Bucket(e.target.value)}
                placeholder="my-bucket"
                required
              />
            </div>
            <div>
              <label className="block text-sm mb-1.5 font-medium">Region</label>
              <input
                className="input-glass font-mono text-sm"
                list="s3-region-list"
                value={s3Region}
                onChange={(e) => setS3Region(e.target.value)}
                placeholder="auto"
              />
              <datalist id="s3-region-list">
                {S3_REGION_HINTS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-sm mb-1.5 font-medium">Endpoint（可选）</label>
              <input
                className="input-glass font-mono text-sm"
                value={s3Endpoint}
                onChange={(e) => setS3Endpoint(e.target.value)}
                placeholder="https://xxx.r2.cloudflarestorage.com"
              />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={s3ForcePathStyle}
                onChange={(e) => setS3ForcePathStyle(e.target.checked)}
              />
              Force path-style（MinIO 等常需开启）
            </label>
            <div>
              <label className="block text-sm mb-1.5 font-medium">CDN / 公共域名（可选）</label>
              <input
                className="input-glass text-sm"
                value={s3CdnDomain}
                onChange={(e) => setS3CdnDomain(e.target.value)}
                placeholder="cdn.example.com"
              />
            </div>
            <div>
              <label className="block text-sm mb-1.5 font-medium">Public Base URL（可选）</label>
              <input
                className="input-glass text-sm"
                value={s3PublicBaseUrl}
                onChange={(e) => setS3PublicBaseUrl(e.target.value)}
                placeholder="https://pub-xxx.r2.dev"
              />
            </div>
          </>
        ) : (
          <>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              数据库配置优先。Bucket 需含 APPID（如 your-bucket-1250000000）。香港桶 Region 填 ap-hongkong。
            </p>
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
            placeholder={meta?.secretKeySet ? '已配置则留空不修改' : '请输入 SecretKey'}
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
            placeholder="your-bucket-1250000000"
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
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label className="block text-sm font-medium">CDN / 自定义域名</label>
            <button
              type="button"
              className="text-xs text-blue-600 hover:underline"
              onClick={() => setCdnDomain('')}
            >
              清空
            </button>
          </div>
          <input
            className="input-glass text-sm"
            value={cdnDomain}
            onChange={(e) => setCdnDomain(e.target.value)}
            placeholder="可留空（推荐）"
          />
          <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
            网站可用中文域；COS 文件走默认域名（如
            your-bucket-1250000000.cos.ap-hongkong.myqcloud.com）。CDN
            仅英文且已绑到本桶时才填，切勿填中文站域名。
          </p>
          {(cdnLooksChinese || meta?.cdnIgnoredUnsafe) && (
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
            value={thumbWidth}
            onChange={(e) => setThumbWidth(Number(e.target.value) || 480)}
          />
          <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
            120–1200，默认 480（数据万象列表缩略图）
          </p>
        </div>

        <div className="space-y-3 rounded-2xl glass p-4">
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={watermarkEnabled}
              onChange={(e) => setWatermarkEnabled(e.target.checked)}
              className="rounded border-black/20"
            />
            展示链文字水印（可选）
          </label>
          <input
            className="input-glass text-sm"
            value={watermarkText}
            maxLength={40}
            disabled={!watermarkEnabled}
            onChange={(e) => setWatermarkText(e.target.value)}
            placeholder="Gallery"
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
              value={imageStyleThumb}
              onChange={(e) => setImageStyleThumb(e.target.value)}
              placeholder="如 thumb（可留空）"
            />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
              详情/全图样式名
            </label>
            <input
              className="input-glass text-sm"
              value={imageStyleFull}
              onChange={(e) => setImageStyleFull(e.target.value)}
              placeholder="如 full（可留空）"
            />
          </div>
        </div>

          </>
        )}

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
