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
  images: {
    domains: ['*']
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/journeys',
        permanent: false,
      },
    ]
  },
  experimental: {
    newNextLinkBehavior: true,
    instrumentationHook: true,
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
};

module.exports = nextConfig;
