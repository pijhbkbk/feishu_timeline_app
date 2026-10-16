import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

const securityHeaders = [
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  {
    key: 'Cross-Origin-Opener-Policy',
    value: 'same-origin',
  },
  {
    key: 'Cross-Origin-Embedder-Policy',
    value: 'credentialless',
  },
  {
    key: 'Cross-Origin-Resource-Policy',
    value: 'same-origin',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
];

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  output: 'standalone',
  devIndicators: false,
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingRoot: path.join(currentDir, '../../'),
  outputFileTracingExcludes: {
    'next-server': [
      '**/node_modules/typescript/**/*',
      // standalone forces production/isDev:false. Do not trace its unreachable
      // development server/bundler (which brings eval-source-map build tools).
      '**/next/dist/server/dev/next-dev-server.js',
      '**/next/dist/server/lib/router-utils/setup-dev-bundler.js',
    ],
    '*': ['../../node_modules/typescript/**/*'],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/login/callback',
        headers: [
          {
            key: 'Referrer-Policy',
            value: 'no-referrer',
          },
          {
            key: 'Cache-Control',
            value: 'no-store, max-age=0',
          },
        ],
      },
    ];
  },
  async rewrites() {
    const developmentApiProxy =
      process.env.NODE_ENV === 'development'
        ? [{ source: '/api/:path*', destination: 'http://localhost:3001/api/:path*' }]
        : [];

    // The formal routes have one implementation regardless of legacy build flags.
    return developmentApiProxy;
  },
  async redirects() {
    return [
      { source: '/v2/:path*', destination: '/:path*', permanent: false },
      { source: '/projects/flow-map', destination: '/dashboard', permanent: false },
    ];
  },
};

export default nextConfig;
