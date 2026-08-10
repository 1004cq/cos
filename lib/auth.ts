import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { prisma } from './prisma';
import {
  clearLoginFailures,
  getClientIp,
  isLoginBlocked,
  recordLoginFailure,
} from './login-rate-limit';

/** 用于用户不存在时仍执行 compare，降低时序侧信道差异 */
const DUMMY_PASSWORD_HASH =
  '$2a$12$3emq01XyYnbp9iYK2LuMjOv2PqNPFXOHn9KyGqOZ9WjBx/dD0fjGG';

const isProd = process.env.NODE_ENV === 'production';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: '用户名', type: 'text' },
        password: { label: '密码', type: 'password' },
      },
      async authorize(credentials, req) {
        const ip = getClientIp(req?.headers);
        const blocked = isLoginBlocked(ip);
        if (blocked.blocked) {
          // 与「密码错误」区分，便于前端提示；不泄露用户是否存在
          throw new Error(
            `登录尝试过于频繁，请 ${Math.ceil((blocked.retryAfterSec || 900) / 60)} 分钟后再试`
          );
        }

        if (!credentials?.username || !credentials?.password) {
          recordLoginFailure(ip);
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { username: credentials.username },
        });

        // 统一走 bcrypt，避免根据用户是否存在产生明显耗时差
        const hash = user?.password || DUMMY_PASSWORD_HASH;
        const isValid = await compare(credentials.password, hash);

        if (!user || !isValid) {
          recordLoginFailure(ip);
          // 返回 null → 客户端统一「用户名或密码错误」
          return null;
        }

        clearLoginFailures(ip);

        return {
          id: user.id,
          name: user.username,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 天
  },
  pages: {
    signIn: '/admin/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        if (token.name) session.user.name = token.name as string;
      }
      return session;
    },
  },
  // 生产必须配置 NEXTAUTH_SECRET（来自 env）；缺失时 NextAuth 会告警且会话不安全
  secret: process.env.NEXTAUTH_SECRET,
  useSecureCookies: isProd,
  cookies: {
    sessionToken: {
      name: isProd
        ? '__Secure-next-auth.session-token'
        : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: isProd,
      },
    },
  },
};
