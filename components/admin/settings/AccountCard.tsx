'use client';

import { CheckCircle2, KeyRound, Loader2, Save, XCircle } from 'lucide-react';

export type AccountFormValues = {
  username: string;
  currentPassword: string;
  newPassword: string;
  newPassword2: string;
};

type Props = {
  values: AccountFormValues;
  busy: boolean;
  error: string;
  success: string;
  onChange: <K extends keyof AccountFormValues>(key: K, value: AccountFormValues[K]) => void;
  onSubmit: (e: React.FormEvent) => void;
};

export function AccountCard({ values, busy, error, success, onChange, onSubmit }: Props) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-3xl glass p-5 sm:p-6 space-y-5"
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
          value={values.username}
          onChange={(e) => onChange('username', e.target.value)}
          maxLength={32}
        />
      </div>
      <div>
        <label className="block text-sm mb-1.5 font-medium">
          当前密码
          <span className="text-red-500 ml-0.5" aria-hidden>
            *
          </span>
        </label>
        <input
          className="input-glass text-sm"
          type="password"
          name="current-password"
          autoComplete="current-password"
          value={values.currentPassword}
          onChange={(e) => onChange('currentPassword', e.target.value)}
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm mb-1.5 font-medium">新密码（可选）</label>
          <input
            className="input-glass text-sm"
            type="password"
            name="new-password"
            autoComplete="new-password"
            value={values.newPassword}
            onChange={(e) => onChange('newPassword', e.target.value)}
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
            value={values.newPassword2}
            onChange={(e) => onChange('newPassword2', e.target.value)}
            placeholder="再次输入新密码"
            disabled={!values.newPassword}
          />
        </div>
      </div>
      {error ? (
        <div className="rounded-2xl glass px-4 py-3 text-sm text-red-600 flex items-start gap-2">
          <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      {success && !error ? (
        <div className="rounded-2xl glass px-4 py-3 text-sm text-green-700 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        保存账号
      </button>
    </form>
  );
}
