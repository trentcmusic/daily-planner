import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCustomActions, loadDay, saveCustomActions, saveDay } from '../js/storage.js';

function localStorageMock() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

test('Trent and Diane keep separate saved schedules', () => {
  globalThis.localStorage = localStorageMock();
  const event = { id: 'one', title: 'Gaming', color: '#2997df', text: '#ffffff', start: 720, duration: 15 };
  saveDay('trent', '2026-08-27', [event]);
  saveDay('diane', '2026-08-27', [{ ...event, id: 'two', title: 'Journaling' }]);

  assert.equal(loadDay('trent', '2026-08-27')[0].title, 'Gaming');
  assert.equal(loadDay('diane', '2026-08-27')[0].title, 'Journaling');
});

test('the first selected profile claims and converts a legacy schedule', () => {
  globalThis.localStorage = localStorageMock();
  localStorage.setItem('adhd-daily-planner-v1', JSON.stringify({
    version: 1,
    days: {
      '2026-08-27': [{ id: 'old', title: 'Therapy', color: '#5b4a96', text: '#ffffff', start: 48, duration: 2 }],
    },
  }));

  const migrated = loadDay('diane', '2026-08-27');
  assert.equal(migrated[0].start, 720);
  assert.equal(migrated[0].duration, 30);
  assert.deepEqual(loadDay('trent', '2026-08-27'), []);
});

test('legacy Trent actions are removed from Diane while each new bank remains private', () => {
  globalThis.localStorage = localStorageMock();
  const trentAction = { id: 'trent-custom', name: 'Studio time', color: '#4455aa' };
  const dianeAction = { id: 'diane-custom', name: 'Garden', color: '#55aa77' };
  const legacy = JSON.stringify([trentAction]);
  localStorage.setItem('adhd-daily-planner-custom-actions-v1', legacy);
  localStorage.setItem('adhd-daily-planner-custom-actions-v1-trent', legacy);
  localStorage.setItem('adhd-daily-planner-custom-actions-v1-diane', JSON.stringify([trentAction, dianeAction]));

  assert.deepEqual(loadCustomActions('trent'), [trentAction]);
  assert.deepEqual(loadCustomActions('diane'), [dianeAction]);

  const secondDianeAction = { id: 'diane-two', name: 'Call Mom', color: '#aa5577' };
  assert.equal(saveCustomActions('diane', [dianeAction, secondDianeAction]), true);
  assert.deepEqual(loadCustomActions('trent'), [trentAction]);
  assert.deepEqual(loadCustomActions('diane'), [dianeAction, secondDianeAction]);
});
