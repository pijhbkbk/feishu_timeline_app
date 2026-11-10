import { describe, expect, it } from 'vitest';
import { parseExteriorRectificationCommand, readExteriorRectification, requireExteriorRectificationComplete } from './exterior-rectification';
const input = { taskId: 'task-14', expectedTaskVersion: '2026-10-20T00:00:00.000Z', operationId: 'operation-1', supplierName: '合成厂家', completedOn: '2026-10-20', summary: '调整外饰件配色并完成自检' };
describe('exterior rectification contract', () => {
  it('accepts bounded explicit completion without adding an approval role', () => {
    expect(parseExteriorRectificationCommand(input)).toEqual(input);
    expect(parseExteriorRectificationCommand({ ...input, supplierName: ' 合成厂家 ' }).supplierName).toBe('合成厂家');
  });
  it.each([
    { supplierName: '' }, { supplierName: 'x'.repeat(201) }, { supplierName: 'factory\nother' },
    { summary: ' ' }, { summary: 'x'.repeat(4001) }, { summary: '\0' }, { completedOn: '2026-02-30' },
    { expectedTaskVersion: '2026-10-20' }, { operationId: '../oops' }, { taskId: 'x'.repeat(129) }, { status: 'APPROVED' },
  ])('rejects invalid or extra fields %j', patch => expect(() => parseExteriorRectificationCommand({ ...input, ...patch })).toThrow());
  it('fails closed on missing or malformed correction state, but retains ordinary and legacy task compatibility', () => {
    expect(readExteriorRectification({ payload: null })).toBeNull();
    expect(readExteriorRectification({ payload: { technicalReworkSourceTaskId: 'legacy-14' } })).toBeNull();
    expect(() => readExteriorRectification({ payload: { fromNodeCode: 'COLOR_CONSISTENCY_REVIEW', triggerAction: 'REJECT' } })).toThrow();
    expect(() => readExteriorRectification({ payload: { exteriorRectification: { status: 'COMPLETED', sourceTaskId: 'old-14' } } })).toThrow();
    expect(() => requireExteriorRectificationComplete({ payload: { exteriorRectification: { status: 'PENDING', sourceTaskId: 'old-14' } } })).toThrow('先登记');
  });
});
