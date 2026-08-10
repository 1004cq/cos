'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { CheckCircle2, XCircle, Loader2, Save, FlaskConical, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';

type CosPublicConfig = {
  secretId: string;
  secretIdSet: boolean;
  secretKeySet: boolean;
  bucket: string;
  region: string;
  cdnDomain: string;
  cdnDomainEffective?: string;
  cdnIgnoredUnsafe?: boolean;
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

function hasNonAscii(s: string) {
  return /[^\x00-\x7F]/.test(s);
}

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
      // 展示库里的值；若含中文会提示清空
      setCdnDomain(data.cdnDomain || '');
      setThumbWidth(Number(data.thumbWidth) || 480);
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
      // 始终提交（含空字符串），以便清空数据库中的旧 CDN
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

      // 中文站域名不能当 COS CDN：保存前自动清空并提示
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
            placeholder="cq-1327876314"
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
            cq-1327876314.cos.ap-hongkong.myqcloud.com）。CDN
            仅英文且已绑到本桶时才填，切勿填「陈庆.我爱你」。
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
