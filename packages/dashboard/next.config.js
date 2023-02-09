const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  pageExtensions: ['page.tsx', 'page.ts'],
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['isomorphic-lib', 'backend-lib'],
  swcMinify: true,
  publicRuntimeConfig: {
    apiBase: process.env.API_BASE ?? "http://localhost:3001"
  },
  async redirects() {
    return [
      {
        source: '/dashboard',
        destination: '/dashboard/journeys',
        permanent: true,
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: '/:prefix*/dashboard/:path*',
        destination: '/dashboard/:path*',
      },
    ]
  },
  experimental: {
    newNextLinkBehavior: true,
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
};

module.exports = nextConfig;
