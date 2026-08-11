import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { AdminColorDatabaseQueryDto } from './admin-color-database-query.dto';

async function errors(input: Record<string, unknown>) {
  return validate(plainToInstance(AdminColorDatabaseQueryDto, input), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('AdminColorDatabaseQueryDto resource bounds', () => {
  it.each([1, 100])('accepts bounded page %i', async (page) => {
    expect(await errors({ page })).toHaveLength(0);
  });

  it.each([101, 100_000])('rejects deep page %i', async (page) => {
    expect(await errors({ page })).not.toHaveLength(0);
  });

  it.each([1, 48])('accepts bounded pageSize %i', async (pageSize) => {
    expect(await errors({ pageSize })).toHaveLength(0);
  });

  it.each([49, 100_000])('rejects oversized pageSize %i', async (pageSize) => {
    expect(await errors({ pageSize })).not.toHaveLength(0);
  });
});
