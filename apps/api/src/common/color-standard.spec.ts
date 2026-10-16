import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { appendColorStandard, parseColorTechnicalData, parseRegisterMonth } from './color-standard';
import { assignProjectColor, normalizeProjectColorInput } from './project-color';

describe('shared color standard contract', () => {
  it('retains independent angles, zero, null, original text limits and dates', () => {
    const input = { measurements: [{ angle: 15, l: 0, a: null, b: '-0.10', originalControlLimits: 'ΔE ≤ 0.8' }, { angle: '45°', l: 78.2, a: '', b: null }],
      conditions: 'D65 / 10°', originalControlLimits: '原表值', measurementDate: '日期不详', issueDate: null };
    const result = parseColorTechnicalData(input);
    expect(result.measurements).toEqual([{ ...input.measurements[0] }, { ...input.measurements[1], originalControlLimits: null }]);
    expect(result.measurementDate).toBe('日期不详');
    expect(result.issueDate).toBeNull();
    expect(parseRegisterMonth(undefined)).toBeUndefined();
    expect(parseRegisterMonth(null)).toBeNull();
    expect(() => parseRegisterMonth('2026-13')).toThrow();
  });

  it('rejects unsupported metadata, excessive angle counts, nonfinite scalars and oversized original text', () => {
    for (const raw of [{ measurements: [], productionBaseId: 'guess-from-notes' }, { measurements: Array(33).fill({}) },
      { measurements: [{ l: Infinity }] }, { measurements: [], conditions: 'x'.repeat(1001) }]) {
      expect(() => parseColorTechnicalData(raw)).toThrow();
    }
  });

  it('round trips multi-angle aggregate limits above 1,000 characters without truncation', () => {
    const limits = JSON.stringify(Array.from({ length: 3 }, (_, index) => ({ angle: [15, 45, 110][index], sourceLimits: '原限值'.repeat(120) })));
    expect(limits.length).toBeGreaterThan(1000);
    const parsed = parseColorTechnicalData({ measurements: [], originalControlLimits: limits });
    expect(parsed.originalControlLimits).toBe(limits);
    expect(() => parseColorTechnicalData({ measurements: [], originalControlLimits: 'x'.repeat(4001) })).toThrow();
  });

  it('appends a version, retains register month and never rewrites existing standards or mass-production status', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ id: 'color-a' }]),
      color: { findUnique: vi.fn().mockResolvedValue({ id: 'color-a', productionBaseId: 'base-a', registerRevision: 3, registerStatus: 'LISTED', registerMonth: '2024-08', registeredAt: new Date('2024-08-01'), status: 'DRAFT' }), update: vi.fn().mockResolvedValue({ id: 'color-a', registerRevision: 4 }) },
      colorVersion: { aggregate: vi.fn().mockResolvedValue({ _max: { versionNo: 6 } }), create: vi.fn().mockResolvedValue({ id: 'version-7', versionNo: 7 }), update: vi.fn() } };
    const result = await appendColorStandard(tx as unknown as Prisma.TransactionClient, { colorId: 'color-a', expectedRevision: 3, actorId: 'actor', boardCode: 'WV/17', technicalData: parseColorTechnicalData({ measurements: [] }) });
    expect(result.version.versionNo).toBe(7);
    expect(tx.colorVersion.create.mock.calls[0]![0].data).toMatchObject({ versionNo: 7, boardCode: 'WV/17', status: 'DRAFT' });
    expect(tx.colorVersion.update).not.toHaveBeenCalled();
    const colorUpdate = tx.color.update.mock.calls[0]![0].data;
    expect(colorUpdate).not.toHaveProperty('registerMonth');
    expect(colorUpdate).not.toHaveProperty('status');
  });

  it('rejects stale revision before creating any standard', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]), color: { findUnique: vi.fn().mockResolvedValue({ id: 'color-a', productionBaseId: 'base-a', registerRevision: 4 }) }, colorVersion: { create: vi.fn() } };
    await expect(appendColorStandard(tx as unknown as Prisma.TransactionClient, { colorId: 'color-a', expectedRevision: 3, actorId: 'actor', boardCode: 'x', technicalData: { measurements: [] } })).rejects.toMatchObject({ status: 409 });
    expect(tx.colorVersion.create).not.toHaveBeenCalled();
  });

  it('requires an exact existing base match and does not move historic color ownership', async () => {
    const input = normalizeProjectColorInput({ colorMode: 'EXISTING', existingColorId: 'color-sd', productionBaseId: 'base-xg' }, 'project');
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]), productionBase: { findUnique: vi.fn().mockResolvedValue({ id: 'base-xg' }) },
      color: { findUnique: vi.fn().mockResolvedValue({ id: 'color-sd', productionBaseId: 'base-sd' }), update: vi.fn() }, project: { update: vi.fn() } };
    await expect(assignProjectColor(tx as unknown as Prisma.TransactionClient, 'project', input)).rejects.toMatchObject({ status: 400 });
    expect(tx.color.update).not.toHaveBeenCalled();
    expect(tx.project.update).not.toHaveBeenCalled();
  });
});
