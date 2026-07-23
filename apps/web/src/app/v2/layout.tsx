import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { isR26V2PrototypeEnabled } from '../../features/v2/r26-feature';
import { R26PrototypeProvider } from '../../features/v2/prototype-store';
import { R26RealDataProvider } from '../../features/v2/r26-real-data-context';
import { V2Shell } from '../../features/v2/v2-shell';
import '../../styles/r26-v2.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: '轻卡定制色 · V2',
  icons: {
    icon: '/r26-icon.svg',
  },
};

export default function V2Layout({ children }: { children: ReactNode }) {
  if (!isR26V2PrototypeEnabled()) {
    notFound();
  }

  return (
    <div data-ui-version="r26-v2">
      <R26PrototypeProvider>
        <R26RealDataProvider>
          <V2Shell>{children}</V2Shell>
        </R26RealDataProvider>
      </R26PrototypeProvider>
    </div>
  );
}
