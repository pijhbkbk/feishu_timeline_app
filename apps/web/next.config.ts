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
  devIndicators: false,
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingRoot: path.join(currentDir, '../../'),
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
    if (process.env.NEXT_PUBLIC_UI_VERSION !== 'v2') {
      return [];
    }

    return {
      beforeFiles: [
        { source: '/dashboard', destination: '/v2/dashboard' },
        { source: '/projects', destination: '/v2/projects' },
        {
          source: '/projects/:projectId/actions/:action',
          destination: '/v2/projects/:projectId/actions/:action',
        },
        {
          source: '/projects/:projectId/retrospective',
          destination: '/v2/projects/:projectId/retrospective',
        },
        {
          source: '/projects/:projectId',
          destination: '/v2/projects/:projectId',
        },
        { source: '/tasks', destination: '/v2/tasks' },
        { source: '/progress', destination: '/v2/progress' },
        { source: '/materials', destination: '/v2/materials' },
        {
          source: '/admin/audit-logs',
          destination: '/v2/admin/audit-logs',
        },
        {
          source: '/admin/:section',
          destination: '/v2/admin/:section',
        },
        { source: '/admin', destination: '/v2/admin' },
      ],
    };
  },
};

export default nextConfig;
