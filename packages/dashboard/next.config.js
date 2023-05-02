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
        destination: '/journeys',
        permanent: false,
      },
      {
        source: '/oauth2/callback',
        destination: '/dashboard/api/oauth2/callback',
        basePath: false,
        permanent: false,
      },
      {
        source: '/oauth2/callback/:provider',
        destination: '/dashboard/api/oauth2/callback/:provider',
        basePath: false,
        permanent: false,
      },
    ]
  },
  experimental: {
    newNextLinkBehavior: true,
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
};

module.exports = nextConfig;
