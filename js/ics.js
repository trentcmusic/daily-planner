import { SLOT_MINUTES } from './config.js?v=2';

const pad = (value) => String(value).padStart(2, '0');

function escapeText(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll(',', '\\,').replaceAll(';', '\\;');
}

function compactDateTime(date, slot) {
  const [year, month, day] = date.split('-').map(Number);
  const local = new Date(year, month - 1, day, 0, slot * SLOT_MINUTES, 0, 0);
  return `${local.getFullYear()}${pad(local.getMonth() + 1)}${pad(local.getDate())}T${pad(local.getHours())}${pad(local.getMinutes())}00`;
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

export function downloadCalendar(date, events) {
  const blob = new Blob([buildCalendar(date, events)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${date.replaceAll('-', '')}_schedule.ics`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
