import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export default function LegacyLayout({ children }: { children: ReactNode }) {
  if (process.env.V1_FALLBACK_ENABLED !== 'true') {
    notFound();
  }

  return children;
}
