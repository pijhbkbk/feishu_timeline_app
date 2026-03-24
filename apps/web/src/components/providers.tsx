'use client';

import type { PropsWithChildren } from 'react';

import { AuthProvider } from './auth-provider';

export function Providers({ children }: PropsWithChildren) {
  return <AuthProvider>{children}</AuthProvider>;
}
