'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, Globe2, Users, Search } from 'lucide-react';
import { cn, formatDateTime } from '@/lib/utils';

type Summary = {
  days: number;
  totalVisits: number;
  uniqueIps: number;
  todayVisits: number;
};

type VisitItem = {
  id: string;
  ip: string;
  path: string;
  method: string;
  referer?: string | null;
  userAgent?: string | null;
  shareToken?: string | null;
  kind: string;
  createdAt: string;
  region?: string;
};

type VisitsResponse = {
  summary: Summary;
  topIps: { ip: string; count: number; region?: string }[];
  topPaths: { path: string; count: number }[];
  items: VisitItem[];
  page: number;
  pageSize: number;
  totalPages: number;
};

const DAY_OPTIONS = [1, 7, 30] as const;

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return '—';
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function formatIpWithRegion(ip: string, region?: string): string {
  const loc = (region || '').trim() || '—';
  return `${ip}\u3000${loc}`;
}

export default function AdminVisitsPage() {
  const [days, setDays] = useState<number>(7);
  const [page, setPage] = useState(1);
  const [ipInput, setIpInput] = useState('');
  const [pathInput, setPathInput] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [ipFilter, setIpFilter] = useState('');
  const [pathFilter, setPathFilter] = useState('');
  const [data, setData] = useState<VisitsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        days: String(days),
        page: String(page),
        pageSize: '50',
      });
      if (ipFilter) params.set('ip', ipFilter);
      if (pathFilter) params.set('path', pathFilter);
      if (kindFilter) params.set('kind', kindFilter);

      const res = await fetch(`/api/admin/visits?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || '加载失败');
      }
      setData(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [days, page, ipFilter, pathFilter, kindFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  function onFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setIpFilter(ipInput.trim());
    setPathFilter(pathInput.trim());
  }

  function clearFilters() {
    setIpInput('');
    setPathInput('');
    setIpFilter('');
    setPathFilter('');
    setKindFilter('');
    setPage(1);
  }

  function kindLabel(kind: string): string {
    if (kind === 'share') return '分享';
    if (kind === 'page') return '主站';
    if (kind === 'api') return 'API';
    return kind || '—';
  }

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">访客</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            主站图库与分享访问 · 含时间 / IP / 类型（不记录密码与 COS 签名）
          </p>
          <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
            IP 归属来自公开库（ip2region），仅到省市约值，与真实位置可能不符
          </p>
        </div>
        <div className="flex gap-1 rounded-xl glass p-1">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setDays(d);
                setPage(1);
              }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm transition',
                days === d ? 'bg-white/80 text-blue-600 font-medium' : 'hover:bg-white/40'
              )}
            >
              {d === 1 ? '今天' : `${d} 天`}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl glass px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-3xl glass p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/70 flex items-center justify-center">
              <Activity className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              今日访问
            </p>
          </div>
          <p className="text-3xl font-semibold tracking-tight">
            {loading && !summary ? '—' : (summary?.todayVisits ?? 0)}
          </p>
        </div>

        <div className="rounded-3xl glass p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/70 flex items-center justify-center">
              <Globe2 className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              近 {days} 天总次数
            </p>
          </div>
          <p className="text-3xl font-semibold tracking-tight">
            {loading && !summary ? '—' : (summary?.totalVisits ?? 0)}
          </p>
          {(ipFilter || pathFilter || kindFilter) && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              当前为筛选后结果
            </p>
          )}
        </div>

        <div className="rounded-3xl glass p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/70 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              独立 IP
            </p>
          </div>
          <p className="text-3xl font-semibold tracking-tight">
            {loading && !summary ? '—' : (summary?.uniqueIps ?? 0)}
          </p>
        </div>
      </div>

      <form onSubmit={onFilterSubmit} className="rounded-2xl glass p-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[140px]">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: 'var(--text-muted)' }}
          />
          <input
            className="input-glass !pl-10 !py-2 text-sm"
            placeholder="筛选 IP（精确）"
            value={ipInput}
            onChange={(e) => setIpInput(e.target.value)}
          />
        </div>
        <input
          className="input-glass !py-2 text-sm flex-1 min-w-[140px]"
          placeholder="筛选路径（包含，如 / 或 /share）"
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
        />
        <select
          className="input-glass !py-2 !w-auto text-sm"
          value={kindFilter}
          onChange={(e) => {
            setKindFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部类型</option>
          <option value="page">主站 page</option>
          <option value="share">分享 share</option>
        </select>
        <button
          type="button"
          className="btn-ghost !py-2 text-sm"
          onClick={() => {
            setPathInput('/');
            setPathFilter('/');
            setKindFilter('page');
            setPage(1);
          }}
        >
          仅主站 /
        </button>
        <button type="submit" className="btn-primary !py-2 text-sm">
          筛选
        </button>
        {(ipFilter || pathFilter || kindFilter) && (
          <button type="button" onClick={clearFilters} className="btn-ghost !py-2 text-sm">
            清除
          </button>
        )}
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-3xl glass overflow-hidden">
          <div className="px-4 py-3 border-b border-white/40">
            <h2 className="font-semibold text-sm">TOP IP</h2>
          </div>
          {loading && !data ? (
            <p className="text-sm p-6 text-center" style={{ color: 'var(--text-muted)' }}>
              加载中...
            </p>
          ) : !data?.topIps.length ? (
            <p className="text-sm p-6 text-center" style={{ color: 'var(--text-muted)' }}>
              暂无数据
            </p>
          ) : (
            <div className="overflow-x-auto -mx-px">
              <table className="w-full text-sm min-w-[320px]">
                <thead>
                  <tr className="text-left" style={{ color: 'var(--text-muted)' }}>
                    <th className="px-4 py-2 font-medium whitespace-nowrap">IP</th>
                    <th className="px-4 py-2 font-medium text-right whitespace-nowrap">次数</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/40">
                  {data.topIps.map((row) => (
                    <tr key={row.ip}>
                      <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">
                        <button
                          type="button"
                          className="hover:underline text-left whitespace-nowrap"
                          onClick={() => {
                            setIpInput(row.ip);
                            setIpFilter(row.ip);
                            setPage(1);
                          }}
                          title="按此 IP 筛选明细"
                        >
                          {formatIpWithRegion(row.ip, row.region)}
                        </button>
                      </td>
                      <td className="px-4 py-2 text-right font-medium whitespace-nowrap">
                        {row.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-3xl glass overflow-hidden">
          <div className="px-4 py-3 border-b border-white/40">
            <h2 className="font-semibold text-sm">TOP 路径</h2>
          </div>
          {loading && !data ? (
            <p className="text-sm p-6 text-center" style={{ color: 'var(--text-muted)' }}>
              加载中...
            </p>
          ) : !data?.topPaths.length ? (
            <p className="text-sm p-6 text-center" style={{ color: 'var(--text-muted)' }}>
              暂无数据
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left" style={{ color: 'var(--text-muted)' }}>
                    <th className="px-4 py-2 font-medium">路径</th>
                    <th className="px-4 py-2 font-medium text-right">次数</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/40">
                  {data.topPaths.map((row) => (
                    <tr key={row.path}>
                      <td className="px-4 py-2 font-mono text-xs max-w-[280px] truncate">
                        <button
                          type="button"
                          className="hover:underline text-left truncate max-w-full"
                          onClick={() => {
                            setPathInput(row.path);
                            setPathFilter(row.path);
                            setPage(1);
                          }}
                          title="按此路径筛选"
                        >
                          {row.path}
                        </button>
                      </td>
                      <td className="px-4 py-2 text-right font-medium">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-3xl glass overflow-hidden">
        <div className="px-4 py-3 border-b border-white/40 flex items-center justify-between">
          <h2 className="font-semibold text-sm">访问明细</h2>
          <button
            type="button"
            onClick={() => void load()}
            className="btn-ghost !py-1 !px-2 text-xs"
            disabled={loading}
          >
            刷新
          </button>
        </div>

        {loading && !data ? (
          <p className="text-sm p-8 text-center" style={{ color: 'var(--text-muted)' }}>
            加载中...
          </p>
        ) : !data?.items.length ? (
          <p className="text-sm p-8 text-center" style={{ color: 'var(--text-muted)' }}>
            暂无访问记录。打开主站图库或分享链接后会出现在这里。
          </p>
        ) : (
          <div className="overflow-x-auto -mx-px">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr
                  className="text-left border-b border-white/40"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <th className="px-4 py-2.5 font-medium whitespace-nowrap">时间</th>
                  <th className="px-4 py-2.5 font-medium whitespace-nowrap">类型</th>
                  <th className="px-4 py-2.5 font-medium whitespace-nowrap">IP</th>
                  <th className="px-4 py-2.5 font-medium whitespace-nowrap">路径</th>
                  <th className="px-4 py-2.5 font-medium whitespace-nowrap">分享 Token</th>
                  <th className="px-4 py-2.5 font-medium whitespace-nowrap">UA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/40">
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap text-xs font-medium">
                      {formatDateTime(item.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span
                        className={cn(
                          'inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium',
                          item.kind === 'share'
                            ? 'bg-violet-100 text-violet-700'
                            : 'bg-blue-100 text-blue-700'
                        )}
                      >
                        {kindLabel(item.kind)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">
                      <button
                        type="button"
                        className="hover:underline text-left whitespace-nowrap"
                        onClick={() => {
                          setIpInput(item.ip);
                          setIpFilter(item.ip);
                          setPage(1);
                        }}
                        title="按此 IP 筛选明细"
                      >
                        {formatIpWithRegion(item.ip, item.region)}
                      </button>
                    </td>
                    <td
                      className="px-4 py-2.5 font-mono text-xs max-w-[200px] truncate"
                      title={item.path}
                    >
                      {item.path}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs" title={item.shareToken || undefined}>
                      {item.shareToken ? truncate(item.shareToken, 12) : '—'}
                    </td>
                    <td
                      className="px-4 py-2.5 text-xs max-w-[220px] truncate"
                      style={{ color: 'var(--text-muted)' }}
                      title={item.userAgent || undefined}
                    >
                      {truncate(item.userAgent, 48)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 px-4 py-3 border-t border-white/40">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="btn-ghost text-sm disabled:opacity-50"
            >
              上一页
            </button>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {page} / {data.totalPages}
            </span>
            <button
              type="button"
              disabled={page >= data.totalPages || loading}
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              className="btn-ghost text-sm disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
