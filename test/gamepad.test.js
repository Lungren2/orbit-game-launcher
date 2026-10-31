import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepeater, pickTarget, readIntents } from '../src/lib/gamepad.js';

const pad = (pressed = [], axes = [0, 0]) => ({ buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: pressed.includes(index), value: pressed.includes(index) ? 1 : 0 })), axes });
const rect = (left, top, width = 100, height = 50) => ({ left, top, width, height });

test('buttons and the left stick map to navigation intents', () => {
  assert.deepEqual([...readIntents(pad([0, 14]))].sort(), ['confirm', 'left']);
  assert.deepEqual([...readIntents(pad([], [.9, .2]))], ['right']);
  assert.deepEqual([...readIntents(pad([], [.1, -.8]))], ['up']);
  assert.equal(readIntents(pad([], [.3, .3])).size, 0);
  assert.equal(readIntents(null).size, 0);
});

test('presses fire once and only held directions repeat', () => {
  const repeat = createRepeater({ delay: 400, interval: 100 });
  assert.deepEqual(repeat(new Set(['confirm', 'down']), 0), ['confirm', 'down']);
  assert.deepEqual(repeat(new Set(['confirm', 'down']), 300), []);
  assert.deepEqual(repeat(new Set(['confirm', 'down']), 400), ['down']);
  assert.deepEqual(repeat(new Set(['confirm', 'down']), 450), []);
  assert.deepEqual(repeat(new Set(['confirm', 'down']), 500), ['down']);
  assert.deepEqual(repeat(new Set(), 520), []);
  assert.deepEqual(repeat(new Set(['confirm']), 530), ['confirm']);
});

test('spatial navigation prefers aligned targets in the direction of travel', () => {
  const origin = rect(200, 200);
  const above = { id: 'above', rect: rect(200, 100) }, diagonal = { id: 'diagonal', rect: rect(330, 140) }, right = { id: 'right', rect: rect(360, 205) }, left = { id: 'left', rect: rect(40, 200) };
  const all = [above, diagonal, right, left];
  assert.equal(pickTarget(origin, all, 'up').id, 'above');
  assert.equal(pickTarget(origin, all, 'right').id, 'right');
  assert.equal(pickTarget(origin, all, 'left').id, 'left');
  assert.equal(pickTarget(origin, all, 'down'), null);
});
