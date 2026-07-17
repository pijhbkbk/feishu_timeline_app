import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function buildContentSecurityPolicy(nonce: string, isDevelopment: boolean) {
  const scriptSources = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isDevelopment ? ["'unsafe-eval'"] : []),
  ];
  const styleElementSources = isDevelopment
    ? ["'self'", "'unsafe-inline'"]
    : ["'self'", `'nonce-${nonce}'`];
  const connectSources = [
    "'self'",
    ...(isDevelopment
      ? ['http://localhost:3001', 'ws://localhost:3000', 'ws://localhost:3001']
      : []),
  ];

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `style-src-elem ${styleElementSources.join(' ')}`,
    // A small number of flow-map/progress components require dynamic style attributes.
    // Keeping this separate prevents it from authorizing arbitrary inline <style> blocks.
    "style-src-attr 'unsafe-inline'",
    `script-src ${scriptSources.join(' ')}`,
    "script-src-attr 'none'",
    `connect-src ${connectSources.join(' ')}`,
    "worker-src 'self' blob:",
    ...(isDevelopment ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const contentSecurityPolicy = buildContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === 'development',
  );
  const requestHeaders = new Headers(request.headers);

  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicy);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set('Content-Security-Policy', contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
