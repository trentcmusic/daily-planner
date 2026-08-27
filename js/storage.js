import { canPlace, normalizedEvent } from './planner-model.js?v=3';

const STORAGE_KEY = 'adhd-daily-planner-v1';
const STORE_VERSION = 2;
const CUSTOM_ACTIONS_LEGACY_KEY = 'adhd-daily-planner-custom-actions-v1';
const CUSTOM_ACTIONS_MIGRATION_KEY = 'adhd-daily-planner-custom-actions-profile-migration-v2';
const PROFILE_IDS = ['trent', 'diane', 'joint'];
let storageChangeListener = null;
let suppressChangeNotifications = false;

function customActionsKey(profile) {
  return `${CUSTOM_ACTIONS_LEGACY_KEY}-${profile}`;
}

function parsedArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function migrateCustomActions() {
  try {
    if (localStorage.getItem(CUSTOM_ACTIONS_MIGRATION_KEY) === 'done') return;
    const legacyValue = localStorage.getItem(CUSTOM_ACTIONS_LEGACY_KEY);
    if (legacyValue != null) {
      const legacyActions = parsedArray(legacyValue);
      const legacyIds = new Set(legacyActions.map((action) => String(action?.id || '')).filter(Boolean));
      const trentKey = customActionsKey('trent');
      const dianeKey = customActionsKey('diane');
      if (localStorage.getItem(trentKey) == null) localStorage.setItem(trentKey, JSON.stringify(legacyActions));
      const dianeValue = localStorage.getItem(dianeKey);
      const dianeActions = parsedArray(dianeValue).filter((action) => !legacyIds.has(String(action?.id || '')));
      localStorage.setItem(dianeKey, JSON.stringify(dianeActions));
    }
    localStorage.setItem(CUSTOM_ACTIONS_MIGRATION_KEY, 'done');
  } catch {
    // Saving is best-effort; callers still receive an empty or profile-local bank.
  }
}

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

function notifyStorageChange(change) {
  if (suppressChangeNotifications || typeof storageChangeListener !== 'function') return;
  try {
    storageChangeListener(change);
  } catch {
    // Cloud synchronization must never interrupt local planner saves.
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
  const saved = writeStore(store);
  if (saved) notifyStorageChange({ type: 'day', profile, date, events: structuredCloneSafe(events) });
  return saved;
}

export function loadCustomActions(profile) {
  migrateCustomActions();
  try {
    return parsedArray(localStorage.getItem(customActionsKey(profile)));
  } catch {
    return [];
  }
}

export function saveCustomActions(profile, actions) {
  migrateCustomActions();
  try {
    const safeActions = Array.isArray(actions) ? actions : [];
    localStorage.setItem(customActionsKey(profile), JSON.stringify(safeActions));
    notifyStorageChange({ type: 'actions', profile, actions: structuredCloneSafe(safeActions) });
    return true;
  } catch {
    return false;
  }
}

function structuredCloneSafe(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return [];
  }
}

export function setStorageChangeListener(listener) {
  storageChangeListener = typeof listener === 'function' ? listener : null;
}

export function applySyncedDay(profile, date, events) {
  suppressChangeNotifications = true;
  try {
    return saveDay(profile, date, events);
  } finally {
    suppressChangeNotifications = false;
  }
}

export function applySyncedCustomActions(profile, actions) {
  suppressChangeNotifications = true;
  try {
    return saveCustomActions(profile, actions);
  } finally {
    suppressChangeNotifications = false;
  }
}

export function exportLocalSnapshot() {
  const store = readStore();
  const claimedProfile = PROFILE_IDS.find((profile) => Object.keys(profileDays(store, profile)).length) || 'trent';
  if (claimLegacyDays(store, claimedProfile)) writeStore(store);
  const days = [];
  const actions = [];
  for (const profile of PROFILE_IDS) {
    for (const [date, events] of Object.entries(profileDays(store, profile))) {
      if (Array.isArray(events)) days.push({ profile, date, events: structuredCloneSafe(events) });
    }
    actions.push({ profile, actions: structuredCloneSafe(loadCustomActions(profile)) });
  }
  return { days, actions };
}
