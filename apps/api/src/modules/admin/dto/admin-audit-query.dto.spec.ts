import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { AdminAuditQueryDto } from './admin-audit-query.dto';

async function errors(input: Record<string, unknown>) {
  return validate(plainToInstance(AdminAuditQueryDto, input), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('AdminAuditQueryDto', () => {
  it.each([1, 25, 100])('accepts bounded pageSize %i', async (pageSize) => {
    expect(await errors({ pageSize })).toHaveLength(0);
  });

  it.each([0, -1, 1.5, 'nope'])('rejects invalid page %s', async (page) => {
    expect(await errors({ page })).not.toHaveLength(0);
  });

  it.each([101, 100000, 0, -5])('rejects out-of-range pageSize %i', async (pageSize) => {
    expect(await errors({ pageSize })).not.toHaveLength(0);
  });

  it('accepts only the stable sort whitelist', async () => {
    expect(await errors({ sort: 'createdAt:desc' })).toHaveLength(0);
    expect(await errors({ sort: 'createdAt:asc' })).toHaveLength(0);
    expect(await errors({ sort: 'action:desc' })).not.toHaveLength(0);
  });

  it('rejects invalid dates', async () => {
    expect(await errors({ from: 'yesterday' })).not.toHaveLength(0);
    expect(await errors({ to: '2026-99-99' })).not.toHaveLength(0);
  });

  it('rejects an overlong keyword', async () => {
    expect(await errors({ keyword: 'x'.repeat(201) })).not.toHaveLength(0);
  });

  it('accepts an SQL-shaped keyword as inert text but rejects it for exact-code fields', async () => {
    expect(await errors({ keyword: "' OR '1'='1" })).toHaveLength(0);
    expect(await errors({ action: "' OR '1'='1" })).not.toHaveLength(0);
    expect(await errors({ actorUserId: "' OR '1'='1" })).not.toHaveLength(0);
  });

  it('rejects unknown query keys', async () => {
    expect(await errors({ rawSql: 'select *' })).not.toHaveLength(0);
  });
});
