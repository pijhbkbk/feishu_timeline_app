'use client';

import { ColorRegisterWorkspace } from '../features/color-register/workspace';
import { FreeWorkbookWorkspace } from '../features/free-workbook/workspace';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export function AdminColorDatabaseR26() {
  const params=useSearchParams();
  if(params.get('view')==='records'||params.has('colorId'))return <><div style={{padding:'12px 24px'}}><Link href="/admin/color-database">返回自由工作簿</Link></div><ColorRegisterWorkspace /></>;
  return <FreeWorkbookWorkspace />;
}

// Retained for the existing development-material archive route.
export function formatColorStatus(status: string) {
  return ({ DRAFT: '开发中', ACTIVE: '使用中', APPROVED: '已批准', REJECTED: '已退回', ARCHIVED: '已归档', EXITED: '已退出' } as Record<string, string>)[status] ?? status;
}
export function formatDate(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
