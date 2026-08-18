import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { regionTextAsync } from '@/lib/ip-region';

/**
 * 访客统计
 * Query:
 *   days   默认 7，统计最近 N 天
 *   page   明细分页
 *   pageSize
 *   ip     可选筛选
 *   path   可选筛选（contains）
 *   kind   可选：page | share | api
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const days = Math.min(90, Math.max(1, parseInt(searchParams.get('days') || '7', 10)));
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10)));
    const ipFilter = searchParams.get('ip')?.trim();
    const pathFilter = searchParams.get('path')?.trim();
    const kindFilter = searchParams.get('kind')?.trim();

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const where: {
      createdAt: { gte: Date };
      ip?: string;
      path?: { contains: string; mode: 'insensitive' };
      kind?: string;
    } = {
      createdAt: { gte: since },
    };
    if (ipFilter) where.ip = ipFilter;
    if (pathFilter) where.path = { contains: pathFilter, mode: 'insensitive' };
    if (kindFilter === 'page' || kindFilter === 'share' || kindFilter === 'api') {
      where.kind = kindFilter;
    }

    const [total, recent, byIpRaw, byPathRaw, todayCount] = await Promise.all([
      prisma.visit.count({ where }),
      prisma.visit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.visit.groupBy({
        by: ['ip'],
        where: { createdAt: { gte: since } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 30,
      }),
      prisma.visit.groupBy({
        by: ['path'],
        where: { createdAt: { gte: since } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 20,
      }),
      prisma.visit.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
    ]);

    const uniqueIps = await prisma.visit.findMany({
      where: { createdAt: { gte: since } },
      distinct: ['ip'],
      select: { ip: true },
    });

    const regionOf = async (ip: string) => {
      try {
        return await regionTextAsync(ip);
      } catch {
        return '—';
      }
    };

    const [topIps, items] = await Promise.all([
      Promise.all(
        byIpRaw.map(async (r) => ({
          ip: r.ip,
          count: r._count.id,
          region: await regionOf(r.ip),
        }))
      ),
      Promise.all(
        recent.map(async (item) => ({
          ...item,
          region: await regionOf(item.ip),
        }))
      ),
    ]);

    return NextResponse.json({
      summary: {
        days,
        totalVisits: total,
        uniqueIps: uniqueIps.length,
        todayVisits: todayCount,
      },
      topIps,
      topPaths: byPathRaw.map((r) => ({ path: r.path, count: r._count.id })),
      items,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '获取失败';
    console.error('visits stats error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
