'use client';

import { usePathname } from 'next/navigation';
import type { PropsWithChildren } from 'react';

import {
  isFormalV2Path,
  isProductionV2Ui,
} from '../features/v2/production-ui';
import { AppShell } from './app-shell';
import { Providers } from './providers';

export function RootRuntime({ children }: PropsWithChildren) {
  const pathname = usePathname();

  if (
    pathname.startsWith('/v2') ||
    (isProductionV2Ui() && isFormalV2Path(pathname))
  ) {
    return children;
  }

  return (
    <Providers>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
