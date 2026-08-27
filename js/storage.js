import { canPlace, normalizedEvent } from './planner-model.js?v=2';

const STORAGE_KEY = 'adhd-daily-planner-v1';

function readStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && parsed.days && typeof parsed.days === 'object'
      ? parsed
      : { version: 1, days: {} };
  } catch {
    return { version: 1, days: {} };
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

export function loadDay(date) {
  const raw = readStore().days[date];
  if (!Array.isArray(raw)) return [];
  const valid = [];
  for (const item of raw) {
    const event = normalizedEvent(item);
    if (event && canPlace(valid, event)) valid.push(event);
  }
  return valid.sort((a, b) => a.start - b.start);
}

export function saveDay(date, events) {
  const store = readStore();
  store.days[date] = events;
  return writeStore(store);
}
