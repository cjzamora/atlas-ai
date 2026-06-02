// EventLogger: subscribes to bus events and records them as log lines.

import { EventBus } from './event-bus.js';

export class EventLogger {
  constructor(bus, { sink = console.log, clock = () => new Date().toISOString() } = {}) {
    if (!(bus instanceof EventBus)) {
      throw new TypeError('EventLogger requires an EventBus instance');
    }
    this.bus = bus;
    this.sink = sink;
    this.clock = clock;
    this.records = [];
    this.subscriptions = [];
  }

  // Begin logging every publish of the given event names.
  watch(...eventNames) {
    for (const eventName of eventNames) {
      const sub = this.bus.subscribe(eventName, (payload) => {
        const record = { at: this.clock(), eventName, payload };
        this.records.push(record);
        this.sink(`[${record.at}] ${eventName} ${JSON.stringify(payload)}`);
      });
      this.subscriptions.push(sub);
    }
    return this;
  }

  history() {
    return [...this.records];
  }

  stop() {
    for (const sub of this.subscriptions) sub.unsubscribe();
    this.subscriptions = [];
  }
}
