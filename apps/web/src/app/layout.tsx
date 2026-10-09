import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { RootRuntime } from '../components/root-runtime';
import './globals.css';
import '../styles/r26-v2.css';
import '../features/color-projects/color-projects.css';
import './r22.css';
import '../features/personnel/personnel.css';
import '../features/team-work/team-work.css';
import '../features/m1/theme.css';
import '../features/color-register/register.css';

export const metadata: Metadata = {
  title: '轻卡新颜色开发项目管理系统',
  description: '轻卡定制色项目、固定流程、角色待办和开发资料管理。',
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
