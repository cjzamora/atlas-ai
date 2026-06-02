// EventBus: a minimal in-memory publish/subscribe implementation.

import { createSubscription, createRegistry } from './subscription.js';

export class EventBus {
  constructor() {
    this.registry = createRegistry();
  }

  // Register a handler for an event; returns a subscription handle.
  subscribe(eventName, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('handler must be a function');
    }
    return createSubscription(eventName, handler, this.registry);
  }

  // Subscribe and auto-unsubscribe after the first delivery.
  once(eventName, handler) {
    const subscription = this.subscribe(eventName, (payload) => {
      subscription.unsubscribe();
      handler(payload);
    });
    return subscription;
  }

  // Remove a previously created subscription handle.
  unsubscribe(subscription) {
    return subscription.unsubscribe();
  }

  // Deliver a payload to every active subscriber of an event.
  publish(eventName, payload) {
    const subscribers = this.registry.list(eventName);
    let delivered = 0;
    for (const subscription of subscribers) {
      if (!subscription.isActive()) continue;
      subscription.handler(payload);
      delivered++;
    }
    return delivered;
  }

  subscriberCount(eventName) {
    return this.registry.list(eventName).length;
  }

  clear() {
    this.registry.clear();
  }
}

export function createEventBus() {
  return new EventBus();
}
