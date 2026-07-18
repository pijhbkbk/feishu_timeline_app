import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import {
  AdminAuditWorkspaceR25A,
  AuditDetailDrawer,
} from './admin-audit-workspace-r25a';

describe('AdminAuditWorkspaceR25A', () => {
  it('renders a real read-only workspace with loading, filters and no mutation actions', () => {
    const html = renderToStaticMarkup(<AdminAuditWorkspaceR25A />);
    expect(html).toContain('审计日志');
    expect(html).toContain('正在加载审计日志');
    expect(html).toContain('高级筛选');
    expect(html).toContain('服务端有界查询');
    expect(html).not.toContain('已创建骨架');
    expect(html).not.toContain('删除日志');
    expect(html).not.toContain('编辑日志');
  });

  it('renders only redacted detail values in the read-only drawer', () => {
    const html = renderToStaticMarkup(
      <AuditDetailDrawer
        isLoading={false}
        error={null}
        onClose={() => undefined}
        detail={{
          id: 'audit-1',
          createdAt: '2026-07-18T08:00:00.000Z',
          actorId: 'user-1',
          actorName: '管理员',
          actorRole: 'admin',
          action: 'PROJECT_UPDATED',
          entityType: 'PROJECT',
          entityId: 'project-1',
          projectId: 'project-1',
          projectName: '项目一',
          result: 'SUCCESS',
          requestId: 'request-1',
          summary: '更新项目',
          nodeCode: null,
          ipAddress: '192.168.*.*',
          userAgent: null,
          reason: null,
          beforeSummary: { token: '[REDACTED]' },
          afterSummary: null,
          metadata: { appSecret: '[REDACTED]' },
        }}
      />,
    );
    expect(html).toContain('只读 · 已脱敏');
    expect(html).toContain('[REDACTED]');
    expect(html).not.toContain('real-token');
    expect(html).not.toContain('删除');
  });

  it('renders detail error state independently of the list', () => {
    const html = renderToStaticMarkup(
      <AuditDetailDrawer
        detail={null}
        isLoading={false}
        error="审计详情加载失败。"
        onClose={() => undefined}
      />,
    );
    expect(html).toContain('审计详情加载失败。');
  });
});
