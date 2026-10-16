import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { DevelopmentReportsService } from './development-reports.service';

const actor = {
  id: 'project-manager-1',
  roleCodes: ['project_manager'],
  permissionCodes: ['project.read', 'workflow.transition'],
  isSystemAdmin: false,
} as never;

const validInput = {
  reportTitle: '新颜色开发报告',
  demandSource: '市场需求',
  targetMarket: '国内',
  targetVehicleModel: '轻卡',
  targetColorName: '星云蓝',
  benchmarkColorRef: null,
  developmentReason: '扩充产品色系',
  expectedLaunchDate: '2026-12-01T00:00:00.000Z',
  estimatedAnnualVolume: 1200,
  technicalRequirements: '满足技术规范',
  qualityRequirements: '满足质量规范',
  costTarget: '预算内',
  riskSummary: null,
  remark: null,
  submitComment: '提交评审',
};

function createHarness() {
  const transaction = vi.fn();
  const projectAccess = vi.fn().mockResolvedValue({ id: 'project-1' });
  const service = new DevelopmentReportsService(
    { $transaction: transaction } as never,
    {} as never,
    {} as never,
    { assertProjectAccessWithDefaultClient: projectAccess } as never,
  );

  return { service, transaction };
}

async function expectRejectedBeforeWrite(input: Record<string, unknown>) {
  const harness = createHarness();

  await expect(harness.service.saveReport('project-1', input, actor)).rejects.toMatchObject({
    response: {
      code: 'DEVELOPMENT_REPORT_INPUT_OUT_OF_BOUNDS',
    },
  });
  expect(harness.transaction).not.toHaveBeenCalled();
}

describe('DevelopmentReportsService resource bounds', () => {
  it('migrates text and integer bounds without a truncating USING expression', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        'prisma/migrations/20260811213000_bound_development_report_text/migration.sql',
      ),
      'utf8',
    );

    expect(migration).toContain('ALTER COLUMN "reportTitle" TYPE VARCHAR(200)');
    expect(migration).toContain('ALTER COLUMN "developmentReason" TYPE VARCHAR(4000)');
    expect(migration).toContain('"estimatedAnnualVolume" BETWEEN 0 AND 2147483647');
    expect(migration).not.toMatch(/\bUSING\b/i);
  });

  it('accepts exact per-field and PostgreSQL Int boundaries within the total budget', async () => {
    const harness = createHarness();

    await expect(
      harness.service.saveReport(
        'project-1',
        {
          ...validInput,
          reportTitle: 'R'.repeat(200),
          estimatedAnnualVolume: 2_147_483_647,
        },
        actor,
      ),
    ).resolves.toBeUndefined();
    expect(harness.transaction).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['reportTitle', 'R'.repeat(201)],
    ['demandSource', 'D'.repeat(501)],
    ['targetMarket', 'M'.repeat(201)],
    ['targetVehicleModel', 'V'.repeat(201)],
    ['targetColorName', 'C'.repeat(201)],
    ['benchmarkColorRef', 'B'.repeat(201)],
    ['developmentReason', 'R'.repeat(4_001)],
    ['technicalRequirements', 'T'.repeat(4_001)],
    ['qualityRequirements', 'Q'.repeat(4_001)],
    ['costTarget', 'C'.repeat(501)],
    ['riskSummary', 'R'.repeat(4_001)],
    ['remark', 'R'.repeat(4_001)],
    ['submitComment', 'C'.repeat(2_001)],
  ])('rejects an oversized %s before opening a write transaction', async (field, value) => {
    await expectRejectedBeforeWrite({ ...validInput, [field]: value });
  });

  it('rejects a multi-field payload above the 16 KiB UTF-8 budget', async () => {
    await expectRejectedBeforeWrite({
      ...validInput,
      developmentReason: '界'.repeat(4_000),
      technicalRequirements: '界'.repeat(1_500),
    });
  });

  it.each(['9'.repeat(33), Number.MAX_SAFE_INTEGER, Number.POSITIVE_INFINITY])(
    'rejects an annual-volume value outside the PostgreSQL Int range: %s',
    async (estimatedAnnualVolume) => {
      await expectRejectedBeforeWrite({ ...validInput, estimatedAnnualVolume });
    },
  );
});
