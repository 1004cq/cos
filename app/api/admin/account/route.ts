import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { compare, hash } from 'bcryptjs';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const MIN_PASSWORD_LEN = 12;

/**
 * GET 当前管理员用户名（需登录）
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const userId = (session.user as { id?: string }).id;
    if (!userId) {
      return NextResponse.json({ error: '会话无效' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true },
    });

    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    return NextResponse.json({ username: user.username });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '读取失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH 修改密码（可选改用户名）
 * Body: { currentPassword, newPassword?, newUsername? }
 * - 必须校验当前密码
 * - 新密码至少 12 位，bcrypt 入库
 * - 新用户名需唯一
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const userId = (session.user as { id?: string }).id;
    if (!userId) {
      return NextResponse.json({ error: '会话无效' }, { status: 401 });
    }

    const body = await req.json();
    const currentPassword =
      typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword =
      typeof body.newPassword === 'string' ? body.newPassword : undefined;
    const newUsernameRaw =
      typeof body.newUsername === 'string' ? body.newUsername.trim() : undefined;

    if (!currentPassword) {
      return NextResponse.json({ error: '请输入当前密码' }, { status: 400 });
    }

    if (!newPassword && !newUsernameRaw) {
      return NextResponse.json({ error: '请填写新密码或新用户名' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    const ok = await compare(currentPassword, user.password);
    if (!ok) {
      return NextResponse.json({ error: '当前密码不正确' }, { status: 400 });
    }

    const data: { password?: string; username?: string } = {};

    if (newPassword !== undefined) {
      if (newPassword.length < MIN_PASSWORD_LEN) {
        return NextResponse.json(
          { error: `新密码至少 ${MIN_PASSWORD_LEN} 位` },
          { status: 400 }
        );
      }
      data.password = await hash(newPassword, 12);
    }

    if (newUsernameRaw !== undefined && newUsernameRaw !== user.username) {
      if (newUsernameRaw.length < 2 || newUsernameRaw.length > 32) {
        return NextResponse.json({ error: '用户名长度需 2–32 位' }, { status: 400 });
      }
      if (!/^[a-zA-Z0-9_\u4e00-\u9fa5-]+$/.test(newUsernameRaw)) {
        return NextResponse.json(
          { error: '用户名仅支持字母、数字、下划线、连字符或中文' },
          { status: 400 }
        );
      }
      const taken = await prisma.user.findUnique({
        where: { username: newUsernameRaw },
      });
      if (taken) {
        return NextResponse.json({ error: '用户名已被占用' }, { status: 409 });
      }
      data.username = newUsernameRaw;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, username: true },
    });

    return NextResponse.json({
      ok: true,
      username: updated.username,
      passwordChanged: Boolean(data.password),
      usernameChanged: Boolean(data.username),
      // 改密后建议重新登录
      requireReLogin: Boolean(data.password || data.username),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '更新失败';
    console.error('update account error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
