import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  // 本地 multipart 大文件（仍建议 Nginx client_max_body_size 2048m）
  experimental: {
    serverActions: {
      bodySizeLimit: '2gb',
    },
  },
};

export default nextConfig;