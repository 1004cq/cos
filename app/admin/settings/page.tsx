'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import {
  AccountCard,
  CosForm,
  OssForm,
  ProviderSwitcher,
  ProviderTabs,
  S3Form,
  SettingsOverviewBar,
  StatusBanner,
  StorageActionsBar,
  TestResultBanner,
  type BusyState,
} from '@/components/admin/settings';
import {
  hasNonAscii,
  type CosPublicConfig,
  type OssPublicConfig,
  type S3PublicConfig,
  type StorageProviderId,
  type TestResult,
} from '@/components/admin/settings-types';

export default function AdminSettingsPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<BusyState>(null);
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

  const [ossAccessKeyId, setOssAccessKeyId] = useState('');
  const [ossAccessKeySecret, setOssAccessKeySecret] = useState('');
  const [ossBucket, setOssBucket] = useState('');
  const [ossRegion, setOssRegion] = useState('oss-cn-hangzhou');
  const [ossEndpoint, setOssEndpoint] = useState('');
  const [ossCname, setOssCname] = useState(false);
  const [ossCdnDomain, setOssCdnDomain] = useState('');
  const [ossPublicBaseUrl, setOssPublicBaseUrl] = useState('');
  const [ossThumbWidth, setOssThumbWidth] = useState(480);
  const [ossWatermarkEnabled, setOssWatermarkEnabled] = useState(false);
  const [ossWatermarkText, setOssWatermarkText] = useState('Gallery');
  const [ossMeta, setOssMeta] = useState<Pick<
    OssPublicConfig,
    'accessKeyId' | 'accessKeyIdSet' | 'accessKeySecretSet' | 'source' | 'ready'
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
      const oss = data.oss || {};
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

      setOssMeta({
        accessKeyId: oss.accessKeyId || '',
        accessKeyIdSet: Boolean(oss.accessKeyIdSet),
        accessKeySecretSet: Boolean(oss.accessKeySecretSet),
        source: oss.source || 'env',
        ready: Boolean(oss.ready),
      });
      setOssBucket(oss.bucket || '');
      setOssRegion(oss.region || 'oss-cn-hangzhou');
      setOssEndpoint(oss.endpoint || '');
      setOssCname(Boolean(oss.cname));
      setOssCdnDomain(oss.cdnDomain || '');
      setOssPublicBaseUrl(oss.publicBaseUrl || '');
      setOssThumbWidth(Number(oss.thumbWidth) || 480);
      setOssWatermarkEnabled(Boolean(oss.watermarkEnabled));
      setOssWatermarkText(oss.watermarkText || 'Gallery');
      setOssAccessKeyId('');
      setOssAccessKeySecret('');

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

    if (provider === 'oss') {
      const oss: Record<string, unknown> = {
        bucket: ossBucket.trim(),
        region: ossRegion.trim() || 'oss-cn-hangzhou',
        endpoint: ossEndpoint.trim(),
        cname: ossCname,
        cdnDomain: ossCdnDomain.trim(),
        publicBaseUrl: ossPublicBaseUrl.trim(),
        thumbWidth: Number(ossThumbWidth) || 480,
        watermarkEnabled: ossWatermarkEnabled,
        watermarkText: ossWatermarkText.trim() || 'Gallery',
      };
      const ak = ossAccessKeyId.trim();
      const sk = ossAccessKeySecret.trim();
      if (ak && !ak.includes('****')) oss.accessKeyId = ak;
      if (sk && !sk.includes('****')) oss.accessKeySecret = sk;
      return { provider: 'oss' as const, oss };
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
      if (provider === 's3') {
        if (!s3Bucket.trim()) throw new Error('Bucket 为必填');
      } else if (provider === 'oss') {
        if (!ossBucket.trim() || !ossRegion.trim()) {
          throw new Error('Bucket 与 Region 为必填');
        }
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
      const oss = data.oss || {};
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
      setOssMeta({
        accessKeyId: oss.accessKeyId || '',
        accessKeyIdSet: Boolean(oss.accessKeyIdSet),
        accessKeySecretSet: Boolean(oss.accessKeySecretSet),
        source: oss.source || 'database',
        ready: Boolean(oss.ready),
      });
      setOssBucket(oss.bucket || ossBucket);
      setOssRegion(oss.region || ossRegion);
      setOssEndpoint(oss.endpoint || '');
      setOssCname(Boolean(oss.cname));
      setOssCdnDomain(oss.cdnDomain || '');
      setOssPublicBaseUrl(oss.publicBaseUrl || '');
      setOssThumbWidth(Number(oss.thumbWidth) || ossThumbWidth);
      setOssWatermarkEnabled(Boolean(oss.watermarkEnabled));
      setOssWatermarkText(oss.watermarkText || ossWatermarkText);
      setOssAccessKeyId('');
      setOssAccessKeySecret('');

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
      const body = buildSaveBody();
      const providerPayload =
        provider === 's3' ? body.s3 : provider === 'oss' ? body.oss : body.cos;
      const res = await fetch('/api/admin/settings/cos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          ...providerPayload,
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
      setOssAccessKeySecret('');
    }
  }

  const providerReady =
    provider === 's3'
      ? s3Meta?.ready
      : provider === 'oss'
        ? ossMeta?.ready
        : meta?.ready;
  const providerSource =
    provider === 's3'
      ? s3Meta?.source
      : provider === 'oss'
        ? ossMeta?.source
        : meta?.source;

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

  return (
    <div className="space-y-6 max-w-3xl pb-24">
      <SettingsOverviewBar provider={provider} ready={providerReady} source={providerSource} />

      <ProviderSwitcher
        provider={provider}
        onChange={setProvider}
        readyMap={{
          cos: Boolean(meta?.ready),
          s3: Boolean(s3Meta?.ready),
          oss: Boolean(ossMeta?.ready),
        }}
      />

      <form
        className="rounded-3xl glass p-5 sm:p-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave(false);
        }}
        autoComplete="off"
        noValidate
      >
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">存储配置</h2>
          <ProviderTabs provider={provider} onChange={setProvider} />
        </div>

        {/* Keep all provider forms mounted so tab switches do not drop filled values */}
        <div className={provider === 'cos' ? 'block' : 'hidden'}>
          <CosForm
            values={{
              secretId,
              secretKey,
              bucket,
              region,
              cdnDomain,
              thumbWidth,
              watermarkEnabled,
              watermarkText,
              imageStyleThumb,
              imageStyleFull,
            }}
            meta={meta}
            onChange={(key, value) => {
              switch (key) {
                case 'secretId':
                  setSecretId(value as string);
                  break;
                case 'secretKey':
                  setSecretKey(value as string);
                  break;
                case 'bucket':
                  setBucket(value as string);
                  break;
                case 'region':
                  setRegion(value as string);
                  break;
                case 'cdnDomain':
                  setCdnDomain(value as string);
                  break;
                case 'thumbWidth':
                  setThumbWidth(value as number);
                  break;
                case 'watermarkEnabled':
                  setWatermarkEnabled(value as boolean);
                  break;
                case 'watermarkText':
                  setWatermarkText(value as string);
                  break;
                case 'imageStyleThumb':
                  setImageStyleThumb(value as string);
                  break;
                case 'imageStyleFull':
                  setImageStyleFull(value as string);
                  break;
              }
            }}
          />
        </div>
        <div className={provider === 's3' ? 'block' : 'hidden'}>
          <S3Form
            values={{
              accessKeyId: s3AccessKeyId,
              secretAccessKey: s3SecretAccessKey,
              bucket: s3Bucket,
              region: s3Region,
              endpoint: s3Endpoint,
              forcePathStyle: s3ForcePathStyle,
              cdnDomain: s3CdnDomain,
              publicBaseUrl: s3PublicBaseUrl,
            }}
            meta={s3Meta}
            onChange={(key, value) => {
              switch (key) {
                case 'accessKeyId':
                  setS3AccessKeyId(value as string);
                  break;
                case 'secretAccessKey':
                  setS3SecretAccessKey(value as string);
                  break;
                case 'bucket':
                  setS3Bucket(value as string);
                  break;
                case 'region':
                  setS3Region(value as string);
                  break;
                case 'endpoint':
                  setS3Endpoint(value as string);
                  break;
                case 'forcePathStyle':
                  setS3ForcePathStyle(value as boolean);
                  break;
                case 'cdnDomain':
                  setS3CdnDomain(value as string);
                  break;
                case 'publicBaseUrl':
                  setS3PublicBaseUrl(value as string);
                  break;
              }
            }}
          />
        </div>
        <div className={provider === 'oss' ? 'block' : 'hidden'}>
          <OssForm
            values={{
              accessKeyId: ossAccessKeyId,
              accessKeySecret: ossAccessKeySecret,
              bucket: ossBucket,
              region: ossRegion,
              endpoint: ossEndpoint,
              cname: ossCname,
              cdnDomain: ossCdnDomain,
              publicBaseUrl: ossPublicBaseUrl,
              thumbWidth: ossThumbWidth,
              watermarkEnabled: ossWatermarkEnabled,
              watermarkText: ossWatermarkText,
            }}
            meta={ossMeta}
            onChange={(key, value) => {
              switch (key) {
                case 'accessKeyId':
                  setOssAccessKeyId(value as string);
                  break;
                case 'accessKeySecret':
                  setOssAccessKeySecret(value as string);
                  break;
                case 'bucket':
                  setOssBucket(value as string);
                  break;
                case 'region':
                  setOssRegion(value as string);
                  break;
                case 'endpoint':
                  setOssEndpoint(value as string);
                  break;
                case 'cname':
                  setOssCname(value as boolean);
                  break;
                case 'cdnDomain':
                  setOssCdnDomain(value as string);
                  break;
                case 'publicBaseUrl':
                  setOssPublicBaseUrl(value as string);
                  break;
                case 'thumbWidth':
                  setOssThumbWidth(value as number);
                  break;
                case 'watermarkEnabled':
                  setOssWatermarkEnabled(value as boolean);
                  break;
                case 'watermarkText':
                  setOssWatermarkText(value as string);
                  break;
              }
            }}
          />
        </div>

        <div className="space-y-3 pt-1">
          {error ? <StatusBanner variant="error">{error}</StatusBanner> : null}
          {success && !error ? <StatusBanner variant="success">{success}</StatusBanner> : null}
          {testResult ? <TestResultBanner result={testResult} /> : null}
          <StorageActionsBar
            busy={busy}
            sticky
            onSave={() => void handleSave(false)}
            onSaveAndTest={() => void handleSave(true)}
            onTestOnly={() => void handleTestOnly()}
          />
        </div>
      </form>

      <AccountCard
        values={{
          username: accountUsername,
          currentPassword,
          newPassword,
          newPassword2,
        }}
        busy={busy === 'account'}
        error={accountError}
        success={accountSuccess}
        onChange={(key, value) => {
          switch (key) {
            case 'username':
              setAccountUsername(value);
              break;
            case 'currentPassword':
              setCurrentPassword(value);
              break;
            case 'newPassword':
              setNewPassword(value);
              break;
            case 'newPassword2':
              setNewPassword2(value);
              break;
          }
        }}
        onSubmit={handleAccountSave}
      />
    </div>
  );
}
