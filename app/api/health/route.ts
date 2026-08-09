import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const checks: Record<string, boolean | string> = {
    database: false,
    cosConfig: false,
    authSecret: false,
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch {
    checks.database = false;
  }

  checks.cosConfig = Boolean(
    process.env.COS_SECRET_ID &&
      process.env.COS_SECRET_KEY &&
      process.env.COS_BUCKET &&
      process.env.COS_REGION
  );

  checks.authSecret = Boolean(process.env.NEXTAUTH_SECRET);

  const ok = checks.database && checks.cosConfig && checks.authSecret;

  return NextResponse.json(
    {
      status: ok ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 }
  );
}