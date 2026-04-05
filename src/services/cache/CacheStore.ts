import type { SourceCacheStatus } from "../../types/domain.types";

export interface CacheLookupResult<T> {
  value: T | undefined;
  status: Extract<SourceCacheStatus, "hit" | "miss">;
}

export interface CacheStore {
  get<T>(key: string): T | undefined;
  getWithStatus<T>(key: string): CacheLookupResult<T>;
  set<T>(key: string, value: T, ttlMs: number): void;
  delete(key: string): void;
  clear(): void;
}
