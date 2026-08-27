const pad = (value) => String(value).padStart(2, '0');

function escapeText(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll(',', '\\,').replaceAll(';', '\\;');
}

function compactDateTime(date, minutes) {
  const [year, month, day] = date.split('-').map(Number);
  const local = new Date(year, month - 1, day, 0, minutes, 0, 0);
  return `${local.getFullYear()}${pad(local.getMonth() + 1)}${pad(local.getDate())}T${pad(local.getHours())}${pad(local.getMinutes())}00`;
}

export function googleCalendarUrl(date, event, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') {
  const parameters = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${compactDateTime(date, event.start)}/${compactDateTime(date, event.start + event.duration)}`,
    details: 'Scheduled with Daily Planner.',
    ctz: timeZone,
  });
  return `https://calendar.google.com/calendar/render?${parameters.toString()}`;
}

function utcStamp(now = new Date()) {
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
}

export function buildCalendar(date, events) {
  const stamp = utcStamp();
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Daily Planner//ADHD-Friendly Planner//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const event of [...events].sort((a, b) => a.start - b.start)) {
    lines.push('BEGIN:VEVENT', `UID:${escapeText(event.id)}@daily-planner.local`, `DTSTAMP:${stamp}`, `DTSTART:${compactDateTime(date, event.start)}`, `DTEND:${compactDateTime(date, event.start + event.duration)}`, `SUMMARY:${escapeText(event.title)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

export function calendarFilename(date) {
  return `${date.replaceAll('-', '')}_schedule.ics`;
}

export function createCalendarFile(date, events) {
  return new File([buildCalendar(date, events)], calendarFilename(date), { type: 'text/calendar;charset=utf-8' });
}

export function downloadCalendar(date, events) {
  const blob = new Blob([buildCalendar(date, events)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = calendarFilename(date);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
