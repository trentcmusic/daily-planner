import { canPlace, normalizedEvent } from './planner-model.js?v=3';

export function mergeEvents(remoteEvents, localEvents) {
  const merged = [];
  const seen = new Set();
  let conflicts = 0;
  for (const source of [remoteEvents, localEvents]) {
    for (const raw of Array.isArray(source) ? source : []) {
      const event = normalizedEvent(raw);
      if (!event || seen.has(event.id)) continue;
      seen.add(event.id);
      if (canPlace(merged, event)) merged.push(event);
      else conflicts += 1;
    }
  }
  return { events: merged.sort((first, second) => first.start - second.start), conflicts };
}

export function mergeActions(remoteActions, localActions) {
  const merged = [];
  const seenIds = new Set();
  const seenValues = new Set();
  for (const source of [remoteActions, localActions]) {
    for (const raw of Array.isArray(source) ? source : []) {
      if (!raw || typeof raw.name !== 'string' || !/^#[0-9a-f]{6}$/i.test(raw.color)) continue;
      const id = String(raw.id || '').trim();
      const fingerprint = `${raw.name.trim().toLocaleLowerCase()}|${raw.color.toLocaleLowerCase()}`;
      if ((id && seenIds.has(id)) || seenValues.has(fingerprint)) continue;
      if (id) seenIds.add(id);
      seenValues.add(fingerprint);
      merged.push({ ...raw, id: id || `custom-${fingerprint}` });
    }
  }
  return merged;
}
