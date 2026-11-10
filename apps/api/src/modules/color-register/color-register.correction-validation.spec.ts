import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ColorRegisterService } from './color-register.service';

const transactionBoundary = new Error('TRANSACTION_NOT_EXECUTED');
const transaction = vi.fn().mockRejectedValue(transactionBoundary);
const service = new ColorRegisterService({ $transaction: transaction } as unknown as PrismaService);
const actor: AuthenticatedUser = {
  id: 'synthetic-member', username: 'synthetic-member', name: '合成成员', email: null,
  departmentId: null, departmentName: null, isSystemAdmin: false, teamAccessApproved: true,
  authSource: 'local', roleCodes: [], permissionCodes: [], authVersion: 1,
};
const request = (changeSummary: unknown) => ({
  operationId: 'synthetic-correction-validation', expectedRevision: 1, boardCode: '00017',
  technicalData: { measurements: [{ angle: '15°', l: 0, a: null, b: '' }], changeSummary },
});

// These tests exercise input rejection before any transaction; database locks,
// append-only history and audit rollback retain their dedicated PostgreSQL tests.
describe('formal standard correction reason', () => {
  beforeEach(() => { transaction.mockClear(); });

  it.each([undefined, null, '', ' ', '\t\r\n', '\u3000\u00a0'])('rejects a missing or whitespace-only reason (%j) before writes', async reason => {
    await expect(service.correctStandard('synthetic-color', request(reason), actor)).rejects.toThrow('请填写更正原因');
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each(['核对原测量后更正', '  保留说明两端原始空格  ', '0'])('allows a substantive reason (%s) to reach the existing authorization transaction', async reason => {
    await expect(service.correctStandard('synthetic-color', request(reason), actor)).rejects.toBe(transactionBoundary);
    expect(transaction).toHaveBeenCalledOnce();
  });
});
