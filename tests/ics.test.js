import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendar, calendarFilename, googleCalendarUrl } from '../js/ics.js';

test('exports valid calendar framing and accurate local times', () => {
  const calendar = buildCalendar('2026-08-25', [{
    id: 'medicine-1', title: 'Take Medicine', color: '#e45d3f', text: '#ffffff', start: 510, duration: 45,
  }]);
  assert.match(calendar, /^BEGIN:VCALENDAR\r\nVERSION:2.0/);
  assert.match(calendar, /DTSTART:20260825T083000/);
  assert.match(calendar, /DTEND:20260825T091500/);
  assert.match(calendar, /SUMMARY:Take Medicine/);
  assert.match(calendar, /BEGIN:VALARM\r\nTRIGGER:-PT5M\r\nACTION:DISPLAY/);
  assert.match(calendar, /END:VCALENDAR\r\n$/);
});

test('builds a prefilled Google Calendar link in the chosen time zone', () => {
  const url = new URL(googleCalendarUrl('2026-08-25', {
    id: 'therapy-1', title: 'Therapy & notes', start: 570, duration: 60,
  }, 'America/New_York'));
  assert.equal(url.origin, 'https://calendar.google.com');
  assert.equal(url.pathname, '/calendar/render');
  assert.equal(url.searchParams.get('action'), 'TEMPLATE');
  assert.equal(url.searchParams.get('text'), 'Therapy & notes');
  assert.equal(url.searchParams.get('dates'), '20260825T093000/20260825T103000');
  assert.equal(url.searchParams.get('ctz'), 'America/New_York');
});

test('Google Calendar links carry events across midnight', () => {
  const url = new URL(googleCalendarUrl('2026-08-25', {
    id: 'bed-1', title: 'Get ready for bed', start: 1425, duration: 30,
  }, 'America/New_York'));
  assert.equal(url.searchParams.get('dates'), '20260825T234500/20260826T001500');
  assert.equal(calendarFilename('2026-08-25'), '20260825_schedule.ics');
});

test('escapes punctuation in event names', () => {
  const calendar = buildCalendar('2026-08-25', [{
    id: 'a', title: 'Plan, pause; reset', color: '#5b57bd', text: '#ffffff', start: 60, duration: 15,
  }]);
  assert.match(calendar, /SUMMARY:Plan\\, pause\\; reset/);
});
