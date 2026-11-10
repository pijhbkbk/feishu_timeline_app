'use client';
import { BUSINESS_TIME_ZONE } from '../lib/local-datetime';

import { ColorRegisterWorkspace } from '../features/color-register/workspace';
import { FreeWorkbookWorkspace } from '../features/free-workbook/workspace';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export function AdminColorDatabaseR26() {
  const params=useSearchParams();
  const workbookId=params.get('workbook');
  const workbookHref=workbookId?`/admin/color-database?view=workbook&workbook=${encodeURIComponent(workbookId)}`:'/admin/color-database?view=workbook';
  const records=params.get('view')==='records'||params.has('colorId');
  if(!records&&(params.get('view')==='workbook'||params.has('workbook')))return <FreeWorkbookWorkspace />;
  return <><div style={{padding:'12px 24px'}}><Link href={workbookHref}>辅助工具：自由工作簿</Link></div><ColorRegisterWorkspace /></>;

}

// Retained for the existing development-material archive route.
export function formatColorStatus(status: string) {
  return ({ DRAFT: '开发中', ACTIVE: '使用中', APPROVED: '已批准', REJECTED: '已退回', ARCHIVED: '已归档', EXITED: '已退出' } as Record<string, string>)[status] ?? status;
}
export function formatDate(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
}
