const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  pageExtensions: ['page.tsx', 'page.ts'],
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['isomorphic-lib', 'backend-lib'],
  swcMinify: true,
  async redirects() {
    return [
      {
        source: '/dashboard',
        destination: '/dashboard/journeys',
        permanent: true,
      },
    ]
  },
  experimental: {
    newNextLinkBehavior: true,
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
};

module.exports = nextConfig;
