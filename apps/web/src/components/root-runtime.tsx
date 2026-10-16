'use client';

import { usePathname } from 'next/navigation';
import type { PropsWithChildren } from 'react';

import { AppShell } from './app-shell';
import { Providers } from './providers';

export function RootRuntime({ children }: PropsWithChildren) {
  const pathname = usePathname();

  if (pathname.startsWith('/v2')) {
    return children;
  }

  return (
    <Providers>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
