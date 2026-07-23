import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { RootRuntime } from '../components/root-runtime';
import './globals.css';
import './r22.css';

export const metadata: Metadata = {
  title: '轻卡新颜色开发项目管理系统',
  description: 'MVP skeleton for the light truck new color development management system.',
};

type RootLayoutProps = {
  children: ReactNode;
};

export default async function RootLayout({ children }: RootLayoutProps) {
  // Reading request headers opts the App Router into dynamic rendering so Next.js
  // can propagate the request-scoped CSP nonce to framework scripts and styles.
  await headers();

  return (
    <html lang="zh-CN">
      <body>
        <RootRuntime>{children}</RootRuntime>
      </body>
    </html>
  );
}
