import { describe, expect, it } from 'vitest';
import { StandardBoardsService } from './standard-boards.service';

function parser() {
  const service = new StandardBoardsService({} as never, {} as never, {} as never, {} as never);
  return service as unknown as { parsePublishInput: (input: unknown) => { boardCode: string; producedAt: Date | null; technicalData: unknown } };
}
const input = { taskId: 'task-07', taskVersion: '2026-10-01T00:00:00.000Z', expectedColorRevision: 1, idempotencyKey: 'publish-1', boardCode: 'WV/17 新汉玉白', technicalData: { measurements: [{ angle: '15°', l: null, a: null, b: null }] } };

describe('standard board publish input', () => {
  it('accepts actual source-style board numbers and preserves null dates', () => {
    expect(parser().parsePublishInput(input)).toMatchObject({ boardCode: input.boardCode, producedAt: null });
    expect(parser().parsePublishInput({ ...input, producedAt: '2020-01-01' }).producedAt?.toISOString()).toBe('2019-12-31T16:00:00.000Z');
  });
  it('rejects client-assigned versions, invalid calendar dates and control characters', () => {
    for (const extra of [{ versionNo: 3 }, { producedAt: '2026-02-30' }, { boardCode: 'WV\n17' }, { boardCode: 'x'.repeat(129) }]) {
      expect(() => parser().parsePublishInput({ ...input, ...extra })).toThrow();
    }
  });
});
