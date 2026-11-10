const KEY = 'truck-color:recent-workbooks:v1';
const MAX_ACTORS = 8;
type Entry = { ownerId: string; workbookId: string };
const sessions = new WeakMap<Window, Entry[]>();

function validEntry(value: unknown): value is Entry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<Entry>;
  return typeof entry.ownerId === 'string' && /^[a-z\d_-]{1,128}$/i.test(entry.ownerId)
    && typeof entry.workbookId === 'string'
    && /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(entry.workbookId);
}

function entries(): Entry[] {
  const cached = sessions.get(window);
  if (cached) return cached;
  let result: Entry[] = [];
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw && raw.length <= 4096) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length <= MAX_ACTORS && parsed.every(validEntry)) {
        result = parsed.map(({ ownerId, workbookId }) => ({ ownerId, workbookId }));
      }
    }
  } catch { /* Restricted storage must not prevent opening a workbook. */ }
  sessions.set(window, result);
  return result;
}

export function recentWorkbook(ownerId: string): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return entries().find(entry => entry.ownerId === ownerId)?.workbookId;
}

// This is a navigation hint only. Every reopened ID still goes through readWorkbook.
export function rememberWorkbook(ownerId: string, workbookId: string): void {
  if (typeof window === 'undefined' || !validEntry({ ownerId, workbookId })) return;
  const next = [{ ownerId, workbookId }, ...entries().filter(entry => entry.ownerId !== ownerId)].slice(0, MAX_ACTORS);
  // Keep the newest ID even when a stale persisted value cannot be overwritten.
  sessions.set(window, next);
  try { window.sessionStorage.setItem(KEY, JSON.stringify(next)); }
  catch { /* Memory survives SPA navigation; persistence across reload is unavailable. */ }
}
