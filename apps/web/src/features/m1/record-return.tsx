'use client';

import React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { carryRecordContext, recordReturnHref } from './context';
import { M1Icon } from './icon';

export function M1RecordReturn({ projectId, fallbackTab = 'flow' }: { projectId: string; fallbackTab?: string }) {
  const search = useSearchParams();
  return <Link className="m1-button" href={recordReturnHref(projectId, search?.toString() ?? '', fallbackTab)}><M1Icon name="back" />返回来源页面</Link>;
}

export function M1RecordLink({ href, ...props }: Omit<React.ComponentProps<typeof Link>, 'href'> & { href: string }) {
  const search = useSearchParams();
  return <Link {...props} href={carryRecordContext(href, search?.toString() ?? '')} />;
}
