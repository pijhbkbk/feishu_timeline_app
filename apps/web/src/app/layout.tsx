import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AppShell } from '../components/app-shell';
import { Providers } from '../components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: '轻卡新颜色开发项目管理系统',
  description: 'MVP skeleton for the light truck new color development management system.',
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
