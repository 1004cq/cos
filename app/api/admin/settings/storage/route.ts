import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getStorageConfigPublic, saveStorageDefault } from '@/lib/settings';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    const config = await getStorageConfigPublic();
    return NextResponse.json(config);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '读取失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const defaultStorage = body.defaultStorage === 'local' ? 'local' : body.defaultStorage === 'cos' ? 'cos' : null;
    if (!defaultStorage) {
      return NextResponse.json({ error: 'defaultStorage 必须是 local 或 cos' }, { status: 400 });
    }

    await saveStorageDefault(defaultStorage);
    const config = await getStorageConfigPublic();
    return NextResponse.json({ success: true, ...config });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '保存失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
