/**
 * Browser-side caching layer with localStorage persistence.
 *
 * Features:
 * - TTL (Time To Live) support
 * - Version-based invalidation
 * - Automatic eviction on quota exceeded
 * - Organization-scoped cache keys
 * - Cache statistics
 */

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  ttl: number;
  version: number;
}

interface CacheConfig {
  version: number;
  defaultTTL: number; // milliseconds
}

export class CacheManager {
  private config: CacheConfig;
  private storageKey = 'app_cache';

  constructor(config: CacheConfig) {
    this.config = config;
    this.cleanupOldVersions();
  }

  /**
   * Clean up cache entries from previous versions.
   */
  private cleanupOldVersions(): void {
    try {
      const cache = this.getCache();
      let hasChanges = false;

      // Remove entries from old versions
      for (const key in cache) {
        if (cache[key].version !== this.config.version) {
          delete cache[key];
          hasChanges = true;
        }
      }

      if (hasChanges) {
        this.saveCache(cache);
        console.log('[CACHE] Cleaned up old version entries');
      }
    } catch (error) {
      console.error('[CACHE] Error cleaning up old versions:', error);
    }
  }

  /**
   * Get entire cache from localStorage.
   */
  private getCache(): Record<string, CacheEntry<any>> {
    try {
      const cached = localStorage.getItem(this.storageKey);
      return cached ? JSON.parse(cached) : {};
    } catch (error) {
      console.error('[CACHE] Error reading cache:', error);
      return {};
    }
  }

  /**
   * Save entire cache to localStorage.
   */
  private saveCache(cache: Record<string, CacheEntry<any>>): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(cache));
    } catch (error) {
      // Quota exceeded - evict oldest 25% of entries
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.warn('[CACHE] Quota exceeded, evicting oldest entries...');
        this.evictOldest(cache, 0.25);

        // Try again after eviction
        try {
          localStorage.setItem(this.storageKey, JSON.stringify(cache));
        } catch (retryError) {
          console.error('[CACHE] Failed to save cache after eviction:', retryError);
        }
      } else {
        console.error('[CACHE] Error saving cache:', error);
      }
    }
  }

  /**
   * Evict oldest entries (by percentage).
   *
   * @param cache - Cache object to evict from
   * @param percentage - Percentage of entries to evict (0-1)
   */
  private evictOldest(cache: Record<string, CacheEntry<any>>, percentage: number): void {
    const entries = Object.entries(cache);
    const countToRemove = Math.ceil(entries.length * percentage);

    // Sort by cachedAt timestamp (oldest first)
    entries.sort((a, b) => a[1].cachedAt - b[1].cachedAt);

    // Remove oldest entries
    const toRemove = entries.slice(0, countToRemove);
    for (const [key] of toRemove) {
      delete cache[key];
    }

    console.log(`[CACHE] Evicted ${countToRemove} oldest entries`);
  }

  /**
   * Set cache entry with TTL.
   *
   * @param key - Cache key (use org-scoped keys like "proposals:list:{orgId}")
   * @param data - Data to cache
   * @param ttl - Time to live in milliseconds (optional, uses default)
   */
  set<T>(key: string, data: T, ttl?: number): void {
    try {
      const cache = this.getCache();

      cache[key] = {
        data,
        cachedAt: Date.now(),
        ttl: ttl ?? this.config.defaultTTL,
        version: this.config.version
      };

      this.saveCache(cache);
      console.log(`[CACHE] Set: ${key} (TTL: ${ttl ?? this.config.defaultTTL}ms)`);
    } catch (error) {
      console.error(`[CACHE] Error setting cache for ${key}:`, error);
    }
  }

  /**
   * Get cache entry and check if expired.
   *
   * @param key - Cache key
   * @returns Cache data and expiration status, or null if not found
   */
  get<T>(key: string): { data: T; isExpired: boolean } | null {
    try {
      const cache = this.getCache();
      const entry = cache[key] as CacheEntry<T> | undefined;

      if (!entry) {
        console.log(`[CACHE] Miss: ${key}`);
        return null;
      }

      // Check version
      if (entry.version !== this.config.version) {
        console.log(`[CACHE] Version mismatch: ${key}`);
        delete cache[key];
        this.saveCache(cache);
        return null;
      }

      // Check if expired
      const age = Date.now() - entry.cachedAt;
      const isExpired = age > entry.ttl;

      if (isExpired) {
        console.log(`[CACHE] Expired: ${key} (age: ${age}ms, ttl: ${entry.ttl}ms)`);
      } else {
        console.log(`[CACHE] Hit: ${key} (age: ${age}ms, ttl: ${entry.ttl}ms)`);
      }

      return {
        data: entry.data,
        isExpired
      };
    } catch (error) {
      console.error(`[CACHE] Error getting cache for ${key}:`, error);
      return null;
    }
  }

  /**
   * Check if cache entry exists and is valid (not expired).
   *
   * @param key - Cache key
   * @returns True if valid cache exists
   */
  isValid(key: string): boolean {
    const entry = this.get(key);
    return entry !== null && !entry.isExpired;
  }

  /**
   * Invalidate cache entries by key or pattern.
   *
   * @param keyOrPattern - Exact key or pattern with wildcard (e.g., "org:123:*")
   */
  invalidate(keyOrPattern?: string): void {
    try {
      const cache = this.getCache();

      if (!keyOrPattern) {
        // Clear all cache
        localStorage.removeItem(this.storageKey);
        console.log('[CACHE] Cleared all cache');
        return;
      }

      // Check if pattern (contains wildcard)
      if (keyOrPattern.includes('*')) {
        const pattern = keyOrPattern.replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`);
        let removedCount = 0;

        for (const key in cache) {
          if (regex.test(key)) {
            delete cache[key];
            removedCount++;
          }
        }

        this.saveCache(cache);
        console.log(`[CACHE] Invalidated ${removedCount} entries matching: ${keyOrPattern}`);
      } else {
        // Exact key
        if (cache[keyOrPattern]) {
          delete cache[keyOrPattern];
          this.saveCache(cache);
          console.log(`[CACHE] Invalidated: ${keyOrPattern}`);
        }
      }
    } catch (error) {
      console.error('[CACHE] Error invalidating cache:', error);
    }
  }

  /**
   * Get cache statistics.
   *
   * @returns Total keys and estimated size
   */
  getStats(): { totalKeys: number; totalSize: number } {
    try {
      const cache = this.getCache();
      const totalKeys = Object.keys(cache).length;
      const cacheString = JSON.stringify(cache);
      const totalSize = new Blob([cacheString]).size;

      return { totalKeys, totalSize };
    } catch (error) {
      console.error('[CACHE] Error getting stats:', error);
      return { totalKeys: 0, totalSize: 0 };
    }
  }
}

// Singleton instance with configuration
export const cacheManager = new CacheManager({
  version: 1,
  defaultTTL: 5 * 60 * 1000, // 5 minutes
});

/**
 * Helper function for always-refresh caching pattern.
 *
 * Strategy:
 * 1. Check cache first, return immediately if valid (instant display)
 * 2. ALWAYS fetch fresh data in background
 * 3. Update cache with fresh data
 *
 * This ensures:
 * - Fast initial display (from cache)
 * - Fresh collaborative data (always fetch)
 * - Never more than a few seconds stale
 *
 * @param cacheKey - Cache key to use
 * @param fetcher - Async function to fetch fresh data
 * @param ttl - Optional TTL in milliseconds
 * @returns Fresh data from fetcher
 */
export async function fetchWithCache<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  ttl?: number
): Promise<{ cached: T | null; fresh: T }> {
  // Check cache first
  const cached = cacheManager.get<T>(cacheKey);
  const cachedData = cached && !cached.isExpired ? cached.data : null;

  // ALWAYS fetch fresh data (even if cache hit)
  const freshData = await fetcher();

  // Update cache with fresh data
  cacheManager.set(cacheKey, freshData, ttl);

  return {
    cached: cachedData,
    fresh: freshData
  };
}
