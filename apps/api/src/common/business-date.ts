/** Date-only facts use the department business calendar, independent of server timezone. */
export function isFutureBusinessDate(raw: string, parsed: Date, now = new Date()) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    return raw > today;
  }
  return parsed.getTime() > now.getTime();
}
