import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus, createEventBus } from '../src/event-bus.js';

test('publish delivers payload to subscribers', () => {
  const bus = new EventBus();
  const received = [];
  bus.subscribe('order', (p) => received.push(p));

  const delivered = bus.publish('order', { id: 1 });

  assert.equal(delivered, 1);
  assert.deepEqual(received, [{ id: 1 }]);
});

test('unsubscribe stops further delivery', () => {
  const bus = createEventBus();
  const sub = bus.subscribe('tick', () => {
    throw new Error('should not fire after unsubscribe');
  });
  sub.unsubscribe();

  assert.equal(bus.publish('tick', {}), 0);
  assert.equal(bus.subscriberCount('tick'), 0);
});

test('once only fires a single time', () => {
  const bus = new EventBus();
  let calls = 0;
  bus.once('boot', () => calls++);

  bus.publish('boot', {});
  bus.publish('boot', {});

  assert.equal(calls, 1);
});

test('subscribe rejects non-function handlers', () => {
  const bus = new EventBus();
  assert.throws(() => bus.subscribe('x', 42), TypeError);
});
