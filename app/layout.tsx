import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SessionProvider } from '@/components/session-provider';

export const metadata: Metadata = {
  title: '相册',
  description: '个人无损照片视频相册',
};

/** viewport-fit=cover 才能让 env(safe-area-inset-*) 在刘海屏生效 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="min-h-full">
      <body className="antialiased min-h-[100dvh]">
        <SessionProvider>
          <div className="min-h-[100dvh]">{children}</div>
        </SessionProvider>
      </body>
    </html>
  );
}