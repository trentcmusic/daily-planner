import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeActions, mergeEvents } from '../js/sync-model.js';

const event = (id, start, title = id) => ({ id, title, color: '#5b57bd', text: '#ffffff', start, duration: 15 });

test('cloud and local events merge without duplicating matching ids', () => {
  const result = mergeEvents([event('one', 600)], [event('one', 600), event('two', 630)]);
  assert.deepEqual(result.events.map((item) => item.id), ['one', 'two']);
  assert.equal(result.conflicts, 0);
});

test('remote event wins when a different local event overlaps', () => {
  const result = mergeEvents([event('remote', 600)], [event('local', 600)]);
  assert.deepEqual(result.events.map((item) => item.id), ['remote']);
  assert.equal(result.conflicts, 1);
});

test('action-bank merge removes semantic duplicates', () => {
  const remote = [{ id: 'studio', name: 'Studio time', color: '#4455aa' }];
  const local = [{ id: 'another-id', name: 'studio TIME', color: '#4455AA' }, { id: 'garden', name: 'Garden', color: '#55aa77' }];
  assert.deepEqual(mergeActions(remote, local).map((item) => item.name), ['Studio time', 'Garden']);
});
