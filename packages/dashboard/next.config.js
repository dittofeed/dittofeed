const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/dashboard",
  output: 'standalone',
  pageExtensions: ['page.tsx', 'page.ts'],
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['isomorphic-lib', 'backend-lib'],
  swcMinify: true,
  async redirects() {
    return [
      {
        source: '/',
        destination: '/dashboard/journeys',
        permanent: true,
      },
      {
        source: '/dashboard/oauth2/callback',
        destination: '/dashboard/journeys',
        permanent: false,
      },
      {
        source: '/dashboard',
        destination: '/dashboard/journeys',
        permanent: true,
      },

    ]
  },
  rewrites() {
    return [
      { source: '/dashboard/_next/:path*', destination: '/_next/:path*' },
    ]
  },
  experimental: {
    newNextLinkBehavior: true,
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
};

module.exports = nextConfig;
