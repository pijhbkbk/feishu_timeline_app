import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth-client', () => ({ apiRequest: vi.fn().mockResolvedValue({}) }));

import { apiRequest } from './auth-client';
import { issueStandardBoard, addBoardDistributionRecord, createColorBoardDetailUpdate } from './standard-boards-client';
import { createFee, updateFee, toFeeFormInput, type FeeRecord } from './fees-client';
import { createPerformanceTest, updatePerformanceTest, type PerformanceTestFormInput } from './performance-tests-client';

const request = vi.mocked(apiRequest);
const local = '2026-10-25T21:37';
const instant = '2026-10-25T13:37:00.000Z';

beforeEach(() => {
  request.mockClear();
  vi.stubEnv('TZ', 'Asia/Shanghai');
});
afterEach(() => vi.unstubAllEnvs());

describe('workspace datetime controls send explicit instants', () => {
  it('keeps issue/distribution/signature/detail update times on the same local day', async () => {
    await issueStandardBoard('p', 'b', { recipientName: '合成', recipientDept: '', issuedAt: local, remark: '' });
    await addBoardDistributionRecord('p', 'b', { receiverName: '合成', receiverDept: '合成', sentAt: local, signedAt: local, note: '' });
    await createColorBoardDetailUpdate('p', { standardBoardId: 'b', updateStatus: 'UPDATED', detailUpdatedAt: local, note: '' });
    expect(request.mock.calls[0]?.[1]?.body).toMatchObject({ issuedAt: instant });
    expect(request.mock.calls[1]?.[1]?.body).toMatchObject({ sentAt: instant, signedAt: instant });
    expect(request.mock.calls[2]?.[1]?.body).toMatchObject({ detailUpdatedAt: instant });
  });

  it('does not manufacture a missing signature time or send an invalid issue', async () => {
    await addBoardDistributionRecord('p', 'b', { receiverName: '合成', receiverDept: '合成', sentAt: local, signedAt: '', note: '' });
    expect(request.mock.calls[0]?.[1]?.body).toMatchObject({ signedAt: null });
    await expect(issueStandardBoard('p', 'b', { recipientName: '合成', recipientDept: '', issuedAt: '2026-02-30T21:37', remark: '' })).rejects.toThrow('日期时间');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('keeps an existing fee instant unchanged on edit and on create', async () => {
    const input = toFeeFormInput({ recordedAt: instant, createdAt: instant, currency: 'CNY', payer: '合成', payStatus: 'RECORDED', note: null } as FeeRecord);
    expect(input.recordedAt).toBe(local);
    await createFee('p', input);
    await updateFee('p', 'f', input);
    for (const [, options] of request.mock.calls) expect(options?.body).toMatchObject({ recordedAt: instant, amount: 10000 });
  });

  it('serializes performance dates for both create and update without altering other facts', async () => {
    const input: PerformanceTestFormInput = { testCode: 'SYN', sampleId: '', relatedObjectName: '', testItem: 'ADHESION', standardValue: 'synthetic', actualValue: 'synthetic', result: 'PASS', conclusion: '合成', testedById: 'm1', testedAt: local };
    await createPerformanceTest('p', input);
    await updatePerformanceTest('p', 't', input);
    for (const [, options] of request.mock.calls) expect(options?.body).toMatchObject({ testedAt: instant, testedById: 'm1', result: 'PASS', sampleId: null });
    expect(input.testedAt).toBe(local);
  });
});
