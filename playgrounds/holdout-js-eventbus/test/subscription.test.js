import test from 'node:test';
import assert from 'node:assert/strict';
import { createSubscription, createRegistry } from '../src/subscription.js';

test('registry tracks added subscriptions per event', () => {
  const registry = createRegistry();
  createSubscription('login', () => {}, registry);
  createSubscription('login', () => {}, registry);
  createSubscription('logout', () => {}, registry);

  assert.equal(registry.list('login').length, 2);
  assert.equal(registry.count(), 3);
});

test('unsubscribe removes the handle from the registry', () => {
  const registry = createRegistry();
  const sub = createSubscription('ping', () => {}, registry);

  assert.equal(sub.isActive(), true);
  assert.equal(sub.unsubscribe(), true);
  assert.equal(sub.isActive(), false);
  assert.equal(registry.list('ping').length, 0);
});

test('double unsubscribe is a no-op', () => {
  const registry = createRegistry();
  const sub = createSubscription('ping', () => {}, registry);

  assert.equal(sub.unsubscribe(), true);
  assert.equal(sub.unsubscribe(), false);
});

test('clear drops every subscription', () => {
  const registry = createRegistry();
  createSubscription('a', () => {}, registry);
  createSubscription('b', () => {}, registry);

  registry.clear();
  assert.equal(registry.count(), 0);
});
