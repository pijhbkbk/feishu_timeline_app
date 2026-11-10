export const BUSINESS_TIME_ZONE = 'Asia/Shanghai';

const businessClockFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  era: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function businessClock(value: Date): string {
  const parts = businessClockFormatter.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)!.value;
  const year = part('era') === 'BC' ? 1 - Number(part('year')) : Number(part('year'));
  const date = `${String(year).padStart(4, '0')}-${part('month')}-${part('day')}`;
  const time = `${part('hour')}:${part('minute')}:${part('second')}.${String(value.getUTCMilliseconds()).padStart(3, '0')}`;
  return `${date}T${time}`;
}

/** Format an event instant for a Beijing datetime-local control. */
export function toDateTimeLocalValue(value: string | null | undefined): string {
  return value ? businessClock(new Date(value)).slice(0, 16) : '';
}

/** Preserve a calendar label, or select the Beijing date of an event instant. */
export function toBusinessDateInputValue(value: string | null | undefined): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return toDateTimeLocalValue(value).slice(0, 10);
}

/** Interpret a datetime-local control as Beijing calendar time for UTC transport. */
export function localDateTimeToIso(value: string): string {
  if (value === '') return '';

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!match) throw new Error('日期时间格式不正确，请重新选择。');
  const [, year, month, day, hour, minute, second = '0', fraction = '0'] = match;
  // A UTC carrier validates the calendar fields independently of the device timezone.
  const calendar = new Date(`${value}Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.getUTCFullYear() !== Number(year) ||
      calendar.getUTCMonth() + 1 !== Number(month) || calendar.getUTCDate() !== Number(day) ||
      calendar.getUTCHours() !== Number(hour) || calendar.getUTCMinutes() !== Number(minute) ||
      calendar.getUTCSeconds() !== Number(second) || calendar.getUTCMilliseconds() !== Number(fraction.padEnd(3, '0'))) {
    throw new Error('日期时间不存在，请重新选择。');
  }
  // Use the named zone for both directions, including historical Beijing DST.
  // Neighboring days expose both offsets when this calendar time is ambiguous.
  const candidates = [-1, 0, 1].map(days => {
    const probe = new Date(calendar.getTime() + days * 86_400_000);
    const offset = new Date(`${businessClock(probe)}Z`).getTime() - probe.getTime();
    return new Date(calendar.getTime() - offset);
  }).filter(candidate => businessClock(candidate) === calendar.toISOString().slice(0, -1));
  if (candidates.length === 0) throw new Error('日期时间不存在，请重新选择。');
  return new Date(Math.min(...candidates.map(candidate => candidate.getTime()))).toISOString();
}
