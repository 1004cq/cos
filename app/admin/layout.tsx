'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Upload,
  Images,
  FolderOpen,
  Share2,
  Settings,
  Home,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
}[] = [
  { href: '/admin', label: '仪表盘', icon: LayoutDashboard, exact: true },
  { href: '/admin/upload', label: '上传', icon: Upload },
  { href: '/admin/albums', label: '相册', icon: FolderOpen },
  { href: '/admin/media', label: '媒体库', icon: Images },
  { href: '/admin/share', label: '分享', icon: Share2 },
  { href: '/admin/settings', label: '设置', icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const isLogin = pathname === '/admin/login';
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!isLogin && status === 'unauthenticated') {
      router.replace('/admin/login');
    }
  }, [isLogin, status, router]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (isLogin) {
    return <>{children}</>;
  }

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>加载中...</p>
      </div>
    );
  }

  const nav = (
    <nav className="flex flex-col gap-1 p-3">
      {NAV.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition',
              active
                ? 'bg-white/80 text-[var(--primary)] shadow-sm'
                : 'text-[var(--text)] hover:bg-white/50'
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-white/50 glass-strong sticky top-0 h-screen">
        <div className="px-5 py-5 border-b border-white/40">
          <p className="text-base font-semibold tracking-tight">陈庆.我爱你</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            管理后台
          </p>
        </div>
        {nav}
        <div className="mt-auto p-3 space-y-1 border-t border-white/40">
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm hover:bg-white/50 transition"
          >
            <Home className="w-4 h-4" />
            时间轴
          </Link>
          <Link
            href="/albums"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm hover:bg-white/50 transition"
          >
            <FolderOpen className="w-4 h-4" />
            前台相册
          </Link>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/admin/login' })}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm hover:bg-white/50 transition text-left"
          >
            <LogOut className="w-4 h-4" />
            退出
            <span className="ml-auto text-xs truncate max-w-[80px]" style={{ color: 'var(--text-muted)' }}>
              {session?.user?.name}
            </span>
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed inset-x-0 top-0 z-30 glass-header px-4 py-3 flex items-center justify-between">
        <div>
          <p className="font-semibold text-sm">管理后台</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            陈庆.我爱你
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost !p-2"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="菜单"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-20 pt-14">
          <button
            type="button"
            className="absolute inset-0 bg-black/20"
            aria-label="关闭菜单"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-64 h-full glass-strong border-r border-white/50 flex flex-col">
            {nav}
            <div className="mt-auto p-3 space-y-1 border-t border-white/40">
              <Link
                href="/"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm hover:bg-white/50"
              >
                <Home className="w-4 h-4" />
                时间轴
              </Link>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/admin/login' })}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm hover:bg-white/50 text-left"
              >
                <LogOut className="w-4 h-4" />
                退出
              </button>
            </div>
          </aside>
        </div>
      )}

      <main className="flex-1 min-w-0 pt-16 md:pt-0">
        <div className="p-4 md:p-8 max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
