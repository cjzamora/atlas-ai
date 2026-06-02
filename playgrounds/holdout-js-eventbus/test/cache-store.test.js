import test from 'node:test';
import assert from 'node:assert/strict';
import { CacheStore } from '../src/cache-store.js';

function fakeClock(start = 0) {
  let t = start;
  const now = () => t;
  now.advance = (ms) => { t += ms; };
  return now;
}

test('set then get returns the stored value', () => {
  const cache = new CacheStore();
  cache.set('user:1', { name: 'Ada' });
  assert.deepEqual(cache.get('user:1'), { name: 'Ada' });
});

test('entries expire after their ttl', () => {
  const now = fakeClock();
  const cache = new CacheStore({ now });
  cache.set('token', 'abc', 1000);

  now.advance(999);
  assert.equal(cache.get('token'), 'abc');

  now.advance(1);
  assert.equal(cache.get('token'), undefined);
});

test('evict removes an entry immediately', () => {
  const cache = new CacheStore();
  cache.set('k', 1);
  assert.equal(cache.evict('k'), true);
  assert.equal(cache.has('k'), false);
});

test('prune clears expired entries', () => {
  const now = fakeClock();
  const cache = new CacheStore({ now });
  cache.set('a', 1, 100);
  cache.set('b', 2, 5000);

  now.advance(200);
  assert.equal(cache.prune(), 1);
  assert.equal(cache.size, 1);
});
