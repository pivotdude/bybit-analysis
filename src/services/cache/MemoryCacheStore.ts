import type { CacheStore } from "./CacheStore";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class MemoryCacheStore implements CacheStore {
  private readonly store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | undefined {
    return this.getWithStatus<T>(key).value;
  }

  getWithStatus<T>(key: string): { value: T | undefined; status: "hit" | "miss" } {
    const entry = this.store.get(key);
    if (!entry) {
      return { value: undefined, status: "miss" };
    }
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return { value: undefined, status: "miss" };
    }
    return { value: entry.value as T, status: "hit" };
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}
