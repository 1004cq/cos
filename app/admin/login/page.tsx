'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await signIn('credentials', {
      username,
      password,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      // NextAuth 把 authorize 抛出的 Error message 放在 error 字段
      const msg = res.error;
      if (msg.includes('过于频繁') || msg.includes('分钟后再试')) {
        setError(msg);
      } else {
        // CredentialsSignin / 其它 → 统一文案，不区分用户是否存在
        setError('用户名或密码错误');
      }
      return;
    }

    router.push('/admin');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md p-8 rounded-3xl glass-strong">
        <h1 className="text-2xl font-semibold mb-1 text-center tracking-tight">陈庆.我爱你</h1>
        <p className="text-center mb-8 text-sm" style={{ color: 'var(--text-muted)' }}>
          管理员登录
        </p>

        <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
          <div>
            <label className="block text-sm mb-1.5 font-medium">用户名</label>
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-glass"
              required
            />
          </div>

          <div>
            <label className="block text-sm mb-1.5 font-medium">密码</label>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-glass"
              required
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
