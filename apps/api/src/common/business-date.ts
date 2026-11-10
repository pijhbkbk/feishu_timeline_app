export const BUSINESS_TIME_ZONE = 'Asia/Shanghai';
const clock = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE, era: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function businessClock(value: Date) {
  const parts = clock.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)!.value;
  const year = part('era') === 'BC' ? 1 - Number(part('year')) : Number(part('year'));
  return `${String(year).padStart(4, '0')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}.${String(value.getUTCMilliseconds()).padStart(3, '0')}`;
}

export function businessDateKey(value: Date) { return businessClock(value).slice(0, 10); }

/** A UTC-midnight carrier represents a DATE column label, not the day's starting instant. */
export function businessCalendarDate(value: Date) { return new Date(`${businessDateKey(value)}T00:00:00.000Z`); }

function calendarValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/.exec(value);
  if (!match) return new Date(NaN);
  const [, year, month, day, hour, minute, second = '0', fraction = '0'] = match;
  const calendar = new Date(`${value}Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.getUTCFullYear() !== Number(year) ||
      calendar.getUTCMonth() + 1 !== Number(month) || calendar.getUTCDate() !== Number(day) ||
      calendar.getUTCHours() !== Number(hour) || calendar.getUTCMinutes() !== Number(minute) ||
      calendar.getUTCSeconds() !== Number(second) || calendar.getUTCMilliseconds() !== Number(fraction.padEnd(3, '0').slice(0, 3))) return new Date(NaN);
  return calendar;
}

/** Match the existing Web Beijing datetime-local parser, including named-zone history. */
function businessLocalInstant(value: string) {
  const calendar = calendarValue(value);
  if (!Number.isFinite(calendar.getTime())) return calendar;
  const candidates = [-1, 0, 1].map(days => {
    const probe = new Date(calendar.getTime() + days * 86400000);
    const offset = new Date(`${businessClock(probe)}Z`).getTime() - probe.getTime();
    return new Date(calendar.getTime() - offset);
  }).filter(candidate => businessClock(candidate) === calendar.toISOString().slice(0, -1));
  return candidates.length ? new Date(Math.min(...candidates.map(candidate => candidate.getTime()))) : new Date(NaN);
}

/** Preserve DATE labels and qualified instants; interpret unqualified ISO time in Beijing. */
export function parseBusinessDate(value: string) {
  const input = value.trim().replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T');
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return calendarValue(`${input}T00:00:00.000`);
  const qualified = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(input);
  if (!qualified) return businessLocalInstant(input);
  const calendar = calendarValue(input.replace(/(?:Z|[+-]\d{2}:?\d{2})$/i, ''));
  return Number.isFinite(calendar.getTime()) ? new Date(input) : new Date(NaN);
}

export function businessCalendarDayStart(calendar: Date) {
  return businessLocalInstant(`${calendar.toISOString().slice(0, 10)}T00:00:00.000`);
}

export function businessCalendarDayEnd(calendar: Date) {
  return new Date(businessCalendarDayStart(new Date(calendar.getTime() + 86400000)).getTime() - 1);
}

export function businessDayRange(value: Date) {
  const calendar = businessCalendarDate(value);
  return { start: businessCalendarDayStart(calendar), end: businessCalendarDayStart(new Date(calendar.getTime() + 86400000)) };
}

export function businessMonthCalendarRange(value: Date) {
  const start = businessCalendarDate(value);
  start.setUTCDate(1);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

export function businessMonthRange(value: Date) {
  const range = businessMonthCalendarRange(value);
  return { start: businessCalendarDayStart(range.start), end: businessCalendarDayStart(range.end) };
}

export function businessDayDifference(later: Date, earlier: Date) {
  return Math.floor((businessCalendarDate(later).getTime() - businessCalendarDate(earlier).getTime()) / 86400000);
}

/** Date-only facts use the department business calendar, independent of server timezone. */
export function isFutureBusinessDate(raw: string, parsed: Date, now = new Date()) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw > businessDateKey(now);
  }
  return parsed.getTime() > now.getTime();
}
