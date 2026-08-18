import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['ip2region.js'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;