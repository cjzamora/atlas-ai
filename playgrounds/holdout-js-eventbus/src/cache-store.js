// CacheStore: a tiny in-memory cache with per-entry TTL and eviction.

export class CacheStore {
  constructor({ defaultTtlMs = 60_000, now = () => Date.now() } = {}) {
    this.defaultTtlMs = defaultTtlMs;
    this.now = now;
    this.entries = new Map();
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    const expiresAt = ttlMs > 0 ? this.now() + ttlMs : Infinity;
    this.entries.set(key, { value, expiresAt });
    return value;
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  evict(key) {
    return this.entries.delete(key);
  }

  // Remove all expired entries and return how many were dropped.
  prune() {
    const cutoff = this.now();
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (cutoff >= entry.expiresAt) {
        this.entries.delete(key);
        removed++;
      }
    }
    return removed;
  }

  get size() {
    return this.entries.size;
  }
}
