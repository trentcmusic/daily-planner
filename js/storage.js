import { canPlace, normalizedEvent } from './planner-model.js?v=3';

const STORAGE_KEY = 'adhd-daily-planner-v1';
const STORE_VERSION = 2;

function emptyStore() {
  return { version: STORE_VERSION, profiles: {}, legacyDays: {} };
}

function migrateLegacyDays(days) {
  if (!days || typeof days !== 'object') return {};
  return Object.fromEntries(Object.entries(days).map(([date, events]) => [
    date,
    Array.isArray(events)
      ? events.map((event) => ({ ...event, start: Number(event.start) * 15, duration: Number(event.duration) * 15 }))
      : [],
  ]));
}

function readStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (parsed && parsed.version === STORE_VERSION && parsed.profiles && typeof parsed.profiles === 'object') {
      return { ...emptyStore(), ...parsed };
    }
    if (parsed && typeof parsed === 'object' && parsed.days && typeof parsed.days === 'object') {
      return { ...emptyStore(), legacyDays: migrateLegacyDays(parsed.days) };
    }
    return emptyStore();
  } catch {
    return emptyStore();
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

function profileDays(store, profile) {
  if (!store.profiles[profile] || typeof store.profiles[profile] !== 'object') store.profiles[profile] = { days: {} };
  if (!store.profiles[profile].days || typeof store.profiles[profile].days !== 'object') store.profiles[profile].days = {};
  return store.profiles[profile].days;
}

function claimLegacyDays(store, profile) {
  if (!Object.keys(store.legacyDays || {}).length) return false;
  const days = profileDays(store, profile);
  for (const [date, events] of Object.entries(store.legacyDays)) {
    if (!Array.isArray(days[date])) days[date] = events;
  }
  store.legacyDays = {};
  return true;
}

export function loadDay(profile, date) {
  const store = readStore();
  const claimedLegacy = claimLegacyDays(store, profile);
  if (claimedLegacy) writeStore(store);
  const raw = profileDays(store, profile)[date];
  if (!Array.isArray(raw)) return [];
  const valid = [];
  for (const item of raw) {
    const event = normalizedEvent(item);
    if (event && canPlace(valid, event)) valid.push(event);
  }
  return valid.sort((a, b) => a.start - b.start);
}

export function saveDay(profile, date, events) {
  const store = readStore();
  claimLegacyDays(store, profile);
  profileDays(store, profile)[date] = events;
  return writeStore(store);
}
