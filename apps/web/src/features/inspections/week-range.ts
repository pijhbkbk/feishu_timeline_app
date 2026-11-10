export type InspectionDateRange = { fromDate: string; toDate: string };
const dayMilliseconds = 86_400_000;
/** Business dates are date-only values (API/PostgreSQL DATE), never browser-local instants. */
export function shanghaiToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function dateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) throw new Error('请选择有效日期。');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new Error('请选择有效日期。');
  return date;
}
export function shiftDate(value: string, days: number): string {
  const shifted = new Date(dateOnly(value).valueOf() + days * dayMilliseconds);
  if (shifted.getUTCFullYear() < 1 || shifted.getUTCFullYear() > 9999) throw new Error('日期超出可查询范围。');
  return shifted.toISOString().slice(0, 10);
}
export function inspectionWeek(value: string): InspectionDateRange {
  const date = dateOnly(value);
  const fromDate = shiftDate(value, -((date.getUTCDay() + 6) % 7));
  return {fromDate, toDate: shiftDate(fromDate, 6)};
}
export function defaultActivityDate(range?: InspectionDateRange, today = shanghaiToday()): string {
  return !range || (today >= range.fromDate && today <= range.toDate) ? today : range.fromDate;
}
