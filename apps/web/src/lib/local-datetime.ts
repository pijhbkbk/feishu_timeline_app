/** Serialize a datetime-local control in the browser's timezone before transport. */
export function localDateTimeToIso(value: string): string {
  if (value === '') return '';

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!match) throw new Error('日期时间格式不正确，请重新选择。');
  const [, year, month, day, hour, minute, second = '0', fraction = '0'] = match;
  const date = new Date(value);
  // Reject invalid calendar values and nonexistent local times instead of rolling them forward.
  if (!Number.isFinite(date.getTime()) || date.getFullYear() !== Number(year) ||
      date.getMonth() + 1 !== Number(month) || date.getDate() !== Number(day) ||
      date.getHours() !== Number(hour) || date.getMinutes() !== Number(minute) ||
      date.getSeconds() !== Number(second) || date.getMilliseconds() !== Number(fraction.padEnd(3, '0'))) {
    throw new Error('日期时间不存在，请重新选择。');
  }
  return date.toISOString();
}
