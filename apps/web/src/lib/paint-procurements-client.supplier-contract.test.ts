import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth-client', () => ({
  API_BASE_URL: '/api',
  apiRequest: vi.fn(),
}));

import { apiRequest } from './auth-client';
import {
  createSupplier,
  fetchSuppliers,
  updateSupplier,
  type SupplierFormInput,
} from './paint-procurements-client';

const mockedApiRequest = vi.mocked(apiRequest);

const input: SupplierFormInput = {
  supplierCode: 'SUP-001',
  supplierName: '安全供应商',
  contactName: '联系人',
  contactPhone: '+86 138-0000-0000',
  status: 'ACTIVE',
};

describe('supplier write client contract', () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
    mockedApiRequest.mockResolvedValue({ id: 'supplier-1' });
  });

  it('sends a fresh Idempotency-Key for each create attempt', async () => {
    await createSupplier(input);
    await createSupplier(input);

    const firstHeaders = mockedApiRequest.mock.calls[0]?.[1]?.headers as Record<string, string>;
    const secondHeaders = mockedApiRequest.mock.calls[1]?.[1]?.headers as Record<string, string>;

    expect(firstHeaders['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(secondHeaders['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(secondHeaders['Idempotency-Key']).not.toBe(firstHeaders['Idempotency-Key']);
  });

  it('binds update writes to the displayed supplier version and a fresh key', async () => {
    await updateSupplier(
      'supplier/1',
      input,
      '2026-08-11T00:00:00.000Z',
    );

    expect(mockedApiRequest).toHaveBeenCalledWith(
      '/suppliers/supplier%2F1',
      {
        method: 'PATCH',
        headers: {
          'Idempotency-Key': expect.stringMatching(/^[0-9a-f-]{36}$/),
        },
        body: {
          ...input,
          expectedVersion: '2026-08-11T00:00:00.000Z',
        },
      },
    );
  });

  it('uses the bounded server-side supplier search contract', async () => {
    await fetchSuppliers(1, '第 101 家');

    expect(mockedApiRequest).toHaveBeenCalledWith(
      '/suppliers?page=1&pageSize=100&q=%E7%AC%AC+101+%E5%AE%B6',
    );
  });
});
