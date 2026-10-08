import { describe, expect, it } from 'vitest';
import type { R26ProgressResponse, R26MaterialVersion } from '../v2/real-types';
import { canRecordNode, materialUploadTarget, paintFields, requireTaskSampleFacts, selectRecordedSample, type TaskSample, type TaskSampleFacts, type TaskSamplesResponse } from './record-facts';

const sample: TaskSample = { id: 'sample-old', sampleNo: 'OLD', sampleName: '旧轮样板', versionNo: 1, isCurrent: false, sampleType: 'PANEL', status: 'CONFIRMED', location: null, remark: '已保存的真实制样记录', producedAt: '2026-09-18T00:00:00.000Z', confirmedAt: '2026-09-19T00:00:00.000Z', createdAt: '2026-09-18T00:00:00.000Z', updatedAt: '2026-09-19T00:00:00.000Z' };
function context(status: string, enabled = true) {
  return { task: { status }, progressSubmissionEnabled: enabled, availableActions: enabled ? [{ action: 'SUBMIT_PROGRESS', label: '提交' }] : [] } as unknown as R26ProgressResponse;
}
function facts(overrides: Partial<TaskSampleFacts> = {}): TaskSampleFacts {
  return { taskId: 'old-04', nodeCode: 'SAMPLE_COLOR_CONFIRMATION', samples: [sample], confirmations: [], ...overrides };
}

describe('M1 saved node facts', () => {
  it.each(['APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED', 'SKIPPED'])('keeps %s in history even if a stale capability is present', status => {
    expect(canRecordNode(context(status))).toBe(false);
  });
  it('treats a superseded returned task as history using the backend capability', () => {
    expect(canRecordNode(context('RETURNED', false))).toBe(false);
    expect(canRecordNode(context('RETURNED'))).toBe(true);
  });
  it('does not substitute the latest project sample when task facts are absent or belong to another task', () => {
    const response = { items: [{ ...sample, id: 'new-project-sample' }] } as unknown as TaskSamplesResponse;
    expect(() => requireTaskSampleFacts(response, 'old-04', 'SAMPLE_COLOR_CONFIRMATION')).toThrow('本轮样板');
    expect(() => requireTaskSampleFacts({ ...response, taskFacts: facts({ taskId: 'new-04' }) }, 'old-04', 'SAMPLE_COLOR_CONFIRMATION')).toThrow('本轮样板');
  });
  it('keeps an explicitly empty task record empty even when the project has current samples', () => {
    const scoped = requireTaskSampleFacts({ items: [sample], taskFacts: facts({ samples: [] }) } as unknown as TaskSamplesResponse, 'old-04', 'SAMPLE_COLOR_CONFIRMATION');
    expect(selectRecordedSample(scoped)).toBeNull();
  });
  it('reads the signed historical sample version instead of another current sample', () => {
    const scoped = facts({ samples: [{ ...sample, id: 'new-sample', isCurrent: true }, sample], confirmations: [{ taskId: 'old-04', sampleId: sample.id }] as TaskSampleFacts['confirmations'] });
    expect(selectRecordedSample(scoped)?.id).toBe('sample-old');
  });
  it('restores saved production fields after an interrupted completion without inventing new facts', () => {
    expect(paintFields(sample)).toEqual({ date: '2026-09-18', sampleNo: 'OLD', sampleName: '旧轮样板', comment: '已保存的真实制样记录' });
    expect(paintFields({ ...sample, producedAt: null }).date).toBe('');
  });
  it('uses the current report attachment as a version replacement when a draft report is corrected', () => {
    const target = materialUploadTarget('draft-01', 'approved-development-report', [{ id: 'proof-other', materialType: 'other' }, { id: 'report-v1', materialType: 'approved-development-report' }] as R26MaterialVersion[]);
    expect(target).toEqual({ path: '/v2/tasks/draft-01/materials/report-v1/versions', replacesAttachmentId: 'report-v1' });
  });
  it('uses initial upload only when that material type is not already present', () => {
    expect(materialUploadTarget('draft-01', 'approved-development-report', [])).toEqual({ path: '/v2/tasks/draft-01/materials', replacesAttachmentId: null });
  });
});
