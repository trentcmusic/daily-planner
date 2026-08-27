import { MAX_DURATION_SLOTS, SLOT_MINUTES, SLOTS_PER_DAY } from './config.js';

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function eventEnd(event) {
  return event.start + event.duration;
}

export function eventsOverlap(first, second) {
  return first.start < eventEnd(second) && second.start < eventEnd(first);
}

export function canPlace(events, candidate, ignoredId = null) {
  if (!Number.isInteger(candidate.start) || !Number.isInteger(candidate.duration)) return false;
  if (candidate.start < 0 || candidate.duration < 1 || eventEnd(candidate) > SLOTS_PER_DAY) return false;
  return !events.some((event) => event.id !== ignoredId && eventsOverlap(event, candidate));
}

export function maximumDuration(events, event) {
  const nextStart = events
    .filter((item) => item.id !== event.id && item.start > event.start)
    .reduce((nearest, item) => Math.min(nearest, item.start), SLOTS_PER_DAY);
  return Math.max(1, Math.min(MAX_DURATION_SLOTS, SLOTS_PER_DAY - event.start, nextStart - event.start));
}

export function nearestHourSlot(date) {
  const roundedHour = Math.round(((date.getHours() * 60) + date.getMinutes()) / 60);
  return Math.min(SLOTS_PER_DAY - 4, roundedHour * 4);
}

export function startingTimelineSlot(isCurrentDay, date) {
  return isCurrentDay ? nearestHourSlot(date) : 0;
}

export function minutesForSlot(slot) {
  return slot * SLOT_MINUTES;
}

export function formatSlot(slot) {
  const totalMinutes = minutesForSlot(slot);
  const hour24 = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${hour24 < 12 ? 'AM' : 'PM'}`;
}

export function eventTimeRange(event) {
  return `${formatSlot(event.start)} – ${formatSlot(eventEnd(event))}`;
}

export function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `event-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function makeEvent(category, start) {
  return {
    id: makeId(), title: category.name, color: category.color, text: category.text || '#ffffff', start, duration: 1,
  };
}

export function normalizedEvent(value) {
  if (!value || typeof value !== 'object') return null;
  const start = Number(value.start);
  const duration = Number(value.duration);
  if (!Number.isInteger(start) || !Number.isInteger(duration)) return null;
  const event = {
    id: String(value.id || makeId()),
    title: String(value.title || 'Event').slice(0, 120),
    color: /^#[0-9a-f]{6}$/i.test(value.color) ? value.color : '#5b57bd',
    text: /^#[0-9a-f]{6}$/i.test(value.text) ? value.text : '#ffffff',
    start,
    duration: clamp(duration, 1, MAX_DURATION_SLOTS),
  };
  return event.start >= 0 && eventEnd(event) <= SLOTS_PER_DAY ? event : null;
}
