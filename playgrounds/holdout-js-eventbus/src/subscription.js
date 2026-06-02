// Subscription handles and a small registry to track active listeners.

let nextId = 1;

export function createSubscription(eventName, handler, registry) {
  const id = nextId++;
  let active = true;

  const subscription = {
    id,
    eventName,
    handler,
    isActive: () => active,
    unsubscribe() {
      if (!active) return false;
      active = false;
      registry.remove(eventName, subscription);
      return true;
    },
  };

  registry.add(eventName, subscription);
  return subscription;
}

export function createRegistry() {
  const byEvent = new Map();

  return {
    add(eventName, subscription) {
      if (!byEvent.has(eventName)) byEvent.set(eventName, new Set());
      byEvent.get(eventName).add(subscription);
    },
    remove(eventName, subscription) {
      const set = byEvent.get(eventName);
      if (!set) return;
      set.delete(subscription);
      if (set.size === 0) byEvent.delete(eventName);
    },
    list(eventName) {
      return Array.from(byEvent.get(eventName) ?? []);
    },
    count() {
      let total = 0;
      for (const set of byEvent.values()) total += set.size;
      return total;
    },
    clear() {
      byEvent.clear();
    },
  };
}
