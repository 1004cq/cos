import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
  title: '管理员登录',
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
