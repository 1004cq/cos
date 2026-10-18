'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  SOURCE_LABEL,
  hasNonAscii,
  type CosPublicConfig,
  type TestResult,
} from '@/components/admin/settings-types';
import { SettingsAccountForm } from '@/components/admin/settings-account-form';
import { SettingsCosForm } from '@/components/admin/settings-cos-form';

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
  const [watermarkText, setWatermarkText] = useState('陈庆.我爱你');
  const [imageStyleThumb, setImageStyleThumb] = useState('');
  const [imageStyleFull, setImageStyleFull] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);

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

      setMeta({
        secretId: data.secretId || '',
        secretIdSet: Boolean(data.secretIdSet),
        secretKeySet: Boolean(data.secretKeySet),
        source: data.source || 'env',
        ready: Boolean(data.ready),
        cdnIgnoredUnsafe: Boolean(data.cdnIgnoredUnsafe),
      });
      setBucket(data.bucket || '');
      setRegion(data.region || 'ap-hongkong');
      setCdnDomain(data.cdnDomain || '');
      setThumbWidth(Number(data.thumbWidth) || 480);
      setWatermarkEnabled(Boolean(data.watermarkEnabled));
      setWatermarkText(data.watermarkText || '陈庆.我爱你');
      setImageStyleThumb(data.imageStyleThumb || '');
      setImageStyleFull(data.imageStyleFull || '');
      setSecretId('');
      setSecretKey('');

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

  function buildPayload() {
    const payload: Record<string, unknown> = {
      bucket: bucket.trim(),
      region: region.trim(),
      cdnDomain: cdnDomain.trim(),
      thumbWidth: Number(thumbWidth) || 480,
      watermarkEnabled,
      watermarkText: watermarkText.trim() || '陈庆.我爱你',
      imageStyleThumb: imageStyleThumb.trim(),
      imageStyleFull: imageStyleFull.trim(),
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
      if (!bucket.trim() || !region.trim()) throw new Error('Bucket 与 Region 为必填');
      let cdn = cdnDomain.trim();
      let clearedChinese = false;
      if (hasNonAscii(cdn) || /xn--/i.test(cdn)) {
        cdn = '';
        setCdnDomain('');
        clearedChinese = true;
      }
      const res = await fetch('/api/admin/settings/cos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...buildPayload(), cdnDomain: cdn, test: withTest }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '保存失败');
      setMeta({
        secretId: data.secretId || '',
        secretIdSet: Boolean(data.secretIdSet),
        secretKeySet: Boolean(data.secretKeySet),
        source: data.source || 'database',
        ready: Boolean(data.ready),
        cdnIgnoredUnsafe: Boolean(data.cdnIgnoredUnsafe),
      });
      setBucket(data.bucket || bucket);
      setRegion(data.region || region);
      setCdnDomain(data.cdnDomain ?? '');
      setThumbWidth(Number(data.thumbWidth) || thumbWidth);
      setWatermarkEnabled(Boolean(data.watermarkEnabled));
      setWatermarkText(data.watermarkText || watermarkText);
      setImageStyleThumb(data.imageStyleThumb || '');
      setImageStyleFull(data.imageStyleFull || '');
      setSecretId('');
      setSecretKey('');
      if (withTest && data.test) {
        setTestResult(data.test as TestResult);
        if (data.test.ok) {
          setSuccess(
            clearedChinese
              ? '已保存；中文站域名不能当 COS CDN，已自动清空。连通性测试通过。'
              : '已保存，连通性测试通过。CDN 可留空（推荐）。'
          );
        } else {
          setSuccess(clearedChinese ? '已保存；中文站域名不能当 COS CDN，已自动清空' : '已保存');
          setError(data.test.error || '连通性测试失败');
        }
      } else {
        setSuccess(
          clearedChinese
            ? '已保存；中文站域名不能当 COS CDN，已自动清空。上传走 COS 源站。'
            : cdn
              ? '配置已保存'
              : '配置已保存；CDN 已清空，上传将使用 COS 源站（推荐）'
        );
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
      const res = await fetch('/api/admin/settings/cos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      const data = (await res.json().catch(() => ({}))) as TestResult & { error?: string };
      setTestResult({
        ok: Boolean(data.ok),
        error: data.error,
        bucket: data.bucket,
        region: data.region,
      });
      if (data.ok) setSuccess('连通性测试通过（未保存表单更改，除非已点保存）');
      else setError(data.error || '连通性测试失败');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '测试失败');
    } finally {
      setBusy(null);
      setSecretKey('');
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
            账号安全 · 腾讯云 COS
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span
            className={cn(
              'px-2.5 py-1 rounded-lg glass',
              meta?.ready ? 'text-green-700' : 'text-amber-700'
            )}
          >
            COS {meta?.ready ? '就绪' : '未就绪'}
          </span>
          <span className="px-2.5 py-1 rounded-lg glass" style={{ color: 'var(--text-muted)' }}>
            来源：{meta ? SOURCE_LABEL[meta.source] : '—'}
          </span>
        </div>
      </div>

      <SettingsAccountForm
        username={accountUsername}
        currentPassword={currentPassword}
        newPassword={newPassword}
        newPassword2={newPassword2}
        busy={busy === 'account'}
        error={accountError}
        success={accountSuccess}
        onUsername={setAccountUsername}
        onCurrentPassword={setCurrentPassword}
        onNewPassword={setNewPassword}
        onNewPassword2={setNewPassword2}
        onSubmit={(e) => void handleAccountSave(e)}
      />

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

      <SettingsCosForm
        meta={meta}
        busy={busy}
        secretId={secretId}
        secretKey={secretKey}
        bucket={bucket}
        region={region}
        cdnDomain={cdnDomain}
        thumbWidth={thumbWidth}
        watermarkEnabled={watermarkEnabled}
        watermarkText={watermarkText}
        imageStyleThumb={imageStyleThumb}
        imageStyleFull={imageStyleFull}
        cdnLooksChinese={cdnLooksChinese}
        onSecretId={setSecretId}
        onSecretKey={setSecretKey}
        onBucket={setBucket}
        onRegion={setRegion}
        onCdnDomain={setCdnDomain}
        onThumbWidth={setThumbWidth}
        onWatermarkEnabled={setWatermarkEnabled}
        onWatermarkText={setWatermarkText}
        onImageStyleThumb={setImageStyleThumb}
        onImageStyleFull={setImageStyleFull}
        onSave={(andTest) => void handleSave(andTest)}
        onTestOnly={() => void handleTestOnly()}
      />
    </div>
  );
}
