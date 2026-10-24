import { describe, expect, it } from 'vitest';
import { createReminderScope, parseReminderScopeJSON, validateReminderScope } from './notification-reminder-scope';

const input = { projectIds: ['project-a'], taskIds: ['task-b', 'task-a'], recipientIds: ['member-b', 'member-a'] };
describe('server-owned reminder scope', () => {
  it('binds every dimension canonically and snapshots caller-owned lists', () => {
    const mutable = structuredClone(input); const scope = createReminderScope(mutable);
    expect(scope).toEqual(createReminderScope({ ...input, taskIds: [...input.taskIds].reverse(), recipientIds: [...input.recipientIds].reverse() }));
    mutable.projectIds.push('outside'); expect(scope.projectIds).toEqual(['project-a']);
    expect(Object.isFrozen(scope)).toBe(true); expect(Object.isFrozen(scope.recipientIds)).toBe(true);
    for (const key of ['projectIds', 'taskIds', 'recipientIds'] as const) {
      expect(createReminderScope({ ...input, [key]: ['different'] }).hash).not.toBe(scope.hash);
    }
    expect(validateReminderScope(scope)).toEqual(scope);
    expect(() => validateReminderScope({ ...scope, hash: '0'.repeat(64) })).toThrow('hash mismatch');
  });
  it.each([null, [], {}, { ...input, extra: true }, { ...input, taskIds: [] }, { ...input, taskIds: ['*'] },
    { ...input, recipientIds: ['same', 'same'] }, { ...input, recipientIds: [5] },
    { ...input, projectIds: [' x'] }, { ...input, taskIds: ['x'.repeat(129)] },
    { ...input, taskIds: Array.from({ length: 51 }, (_, i) => `t${i}`) },
    { ...input, projectIds: Array.from({ length: 11 }, (_, i) => `p${i}`) },
  ])('rejects invalid or unbounded scope %#', value => {
    expect(() => createReminderScope(value)).toThrow('SCOPE_JSON');
  });
  it('rejects oversized and malformed JSON before parsing an optional scope', () => {
    expect(() => parseReminderScopeJSON(' '.repeat(16385))).toThrow('size limit');
    expect(() => parseReminderScopeJSON('{')).toThrow('SCOPE_JSON');
    expect(() => validateReminderScope(null as never)).toThrow('Invalid reminder scope');
  });
});
