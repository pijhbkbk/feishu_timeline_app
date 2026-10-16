import { describe, expect, it } from 'vitest';

import { getControlledColorNumber } from './controlled-color-number';

const controlled = {
  code: 'CLR-Z9-001',
  numberingTaskId: 'task-step-05',
  numberedById: 'user-1',
  numberedAt: new Date('2026-08-05T12:00:00.000Z'),
  numberingAttachmentId: 'attachment-1',
  numberingAttachment: {
    scanStatus: 'CLEAN' as const,
    isDeleted: false,
  },
};

describe('getControlledColorNumber', () => {
  it('returns a number only when the complete step 05 provenance chain exists', () => {
    expect(getControlledColorNumber(controlled)).toBe('CLR-Z9-001');
  });

  it.each([
    'numberingTaskId',
    'numberedById',
    'numberedAt',
    'numberingAttachmentId',
  ] as const)('hides a legacy number when %s is missing', (field) => {
    expect(getControlledColorNumber({ ...controlled, [field]: null })).toBeNull();
  });

  it.each(['LEGACY_UNSCANNED', 'PENDING_SCAN', 'REJECTED', 'SCAN_ERROR'] as const)(
    'hides a color number backed by an attachment in %s state',
    (scanStatus) => {
      expect(
        getControlledColorNumber({
          ...controlled,
          numberingAttachment: { scanStatus, isDeleted: false },
        }),
      ).toBeNull();
    },
  );

  it('hides a color number backed by a deleted attachment', () => {
    expect(
      getControlledColorNumber({
        ...controlled,
        numberingAttachment: { scanStatus: 'CLEAN', isDeleted: true },
      }),
    ).toBeNull();
  });
});
