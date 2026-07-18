import { PERMISSION_METADATA_KEY } from '../auth/auth.constants';
import { describe, expect, it, vi } from 'vitest';

import { AdminAuditLogsController } from './admin-audit-logs.controller';

describe('AdminAuditLogsController', () => {
  it('requires the established audit.read permission without a hard-coded username', () => {
    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, AdminAuditLogsController)).toEqual([
      'audit.read',
    ]);
  });

  it('delegates bounded list and independent detail reads', async () => {
    const service = {
      getAuditLogs: vi.fn().mockResolvedValue({ items: [] }),
      getAuditLogDetail: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    };
    const controller = new AdminAuditLogsController(service as never);
    const query = { page: 2, pageSize: 25 };

    await expect(controller.getAuditLogs(query)).resolves.toEqual({ items: [] });
    await expect(controller.getAuditLogDetail('audit-1')).resolves.toEqual({ id: 'audit-1' });
    expect(service.getAuditLogs).toHaveBeenCalledWith(query);
    expect(service.getAuditLogDetail).toHaveBeenCalledWith('audit-1');
  });

  it('exposes GET methods only', () => {
    const methodNames = Object.getOwnPropertyNames(AdminAuditLogsController.prototype);
    expect(methodNames).toEqual([
      'constructor',
      'getAuditLogs',
      'getAuditLogDetail',
    ]);
  });
});
