import { createHash } from 'node:crypto';

export type ReminderScope = Readonly<{
  projectIds: readonly string[];
  taskIds: readonly string[];
  recipientIds: readonly string[];
  hash: string;
}>;

/** Server configuration only; no request DTO may supply or widen this scope. */
export function createReminderScope(input: unknown): ReminderScope {
  const fail = (): never => { throw new Error('Invalid NOTIFICATION_IN_APP_REMINDER_SCOPE_JSON.'); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail();
  const value = input as Record<string, unknown>;
  const keys = ['projectIds', 'taskIds', 'recipientIds'] as const;
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) return fail();
  const lists = keys.map((key, index) => {
    const list = value[key];
    if (!Array.isArray(list) || list.length < 1 || list.length > (index === 0 ? 10 : 50) ||
        list.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id)) ||
        new Set(list).size !== list.length) return fail();
    return Object.freeze([...(list as string[])].sort());
  });
  const projectIds = lists[0]!; const taskIds = lists[1]!; const recipientIds = lists[2]!;
  const hash = createHash('sha256').update(JSON.stringify({ version: 1, kind: 'ordinary', projectIds, taskIds, recipientIds })).digest('hex');
  return Object.freeze({ projectIds, taskIds, recipientIds, hash });
}

export function parseReminderScopeJSON(value: string): ReminderScope {
  if (Buffer.byteLength(value, 'utf8') > 16 * 1024) throw new Error('NOTIFICATION_IN_APP_REMINDER_SCOPE_JSON exceeds its size limit.');
  let parsed: unknown;
  try { parsed = JSON.parse(value); }
  catch { throw new Error('Invalid NOTIFICATION_IN_APP_REMINDER_SCOPE_JSON.'); }
  return createReminderScope(parsed);
}

/** Revalidate even internal callers and copy arrays before any asynchronous work. */
export function validateReminderScope(value: ReminderScope): ReminderScope {
  if (!value || typeof value !== 'object') throw new Error('Invalid reminder scope.');
  const validated = createReminderScope({ projectIds: value.projectIds, taskIds: value.taskIds, recipientIds: value.recipientIds });
  if (validated.hash !== value.hash) throw new Error('Reminder scope hash mismatch.');
  return validated;
}
