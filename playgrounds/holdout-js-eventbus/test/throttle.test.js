import test from 'node:test';
import assert from 'node:assert/strict';
import { throttle, debounce } from '../src/throttle.js';

function fakeClock(start = 0) {
  let t = start;
  const now = () => t;
  now.advance = (ms) => { t += ms; };
  return now;
}

test('throttle ignores calls inside the cooldown window', () => {
  const now = fakeClock();
  let calls = 0;
  const fn = throttle(() => ++calls, 100, { now });

  fn();
  fn();
  assert.equal(calls, 1);

  now.advance(100);
  fn();
  assert.equal(calls, 2);
});

test('throttle returns the last computed result', () => {
  const now = fakeClock();
  const fn = throttle((x) => x * 2, 100, { now });
  assert.equal(fn(3), 6);
  assert.equal(fn(99), 6);
});

test('debounce fires only after the wait elapses', async () => {
  let calls = 0;
  const fn = debounce(() => calls++, 10);

  fn();
  fn();
  fn();
  assert.equal(calls, 0);

  await new Promise((r) => setTimeout(r, 25));
  assert.equal(calls, 1);
});

test('debounce can be cancelled before firing', async () => {
  let calls = 0;
  const fn = debounce(() => calls++, 10);
  fn();
  fn.cancel();

  await new Promise((r) => setTimeout(r, 25));
  assert.equal(calls, 0);
});
