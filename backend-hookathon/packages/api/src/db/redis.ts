// ============================================
// Redis Client
// Caching layer (optional — degrades gracefully)
// ============================================

import Redis from "ioredis";

// Singleton instance
let redisClient: Redis | null = null;
let redisAvailable = false;

/**
 * Get the Redis client (singleton).
 * Returns null if REDIS_URL is not configured or connection fails.
 */
export function getRedis(): Redis | null {
  if (!redisClient) {
    const url = process.env.REDIS_URL;

    if (!url) {
      console.warn(
        "[redis] REDIS_URL not set — caching disabled, API will work without cache",
      );
      return null;
    }

    redisClient = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) {
          console.warn("[redis] Max retries reached — caching disabled");
          redisAvailable = false;
          return null; // Stop retrying
        }
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      lazyConnect: true,
    });

    redisClient.on("error", (err) => {
      if (redisAvailable) {
        console.error("[redis] Connection error:", err.message);
        redisAvailable = false;
      }
    });

    redisClient.on("connect", () => {
      console.log("[redis] Connected to Redis");
      redisAvailable = true;
    });

    redisClient.on("close", () => {
      redisAvailable = false;
    });

    // Attempt initial connection
    redisClient.connect().catch((err) => {
      console.warn("[redis] Initial connection failed:", err.message, "— caching disabled");
      redisAvailable = false;
    });
  }

  return redisClient;
}

/**
 * Check if Redis is currently available
 */
export function isRedisAvailable(): boolean {
  return redisAvailable && redisClient !== null;
}

/**
 * Cache utilities — all operations are safe to call even when Redis is down.
 * Gets return null, sets/deletes are no-ops.
 */
export const cache = {
  /**
   * Get cached value
   */
  async get<T>(key: string): Promise<T | null> {
    if (!isRedisAvailable()) return null;
    try {
      const value = await redisClient!.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  },

  /**
   * Set cached value with optional TTL (in seconds)
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    if (!isRedisAvailable()) return;
    try {
      const serialized =
        typeof value === "string" ? value : JSON.stringify(value);
      if (ttl) {
        await redisClient!.setex(key, ttl, serialized);
      } else {
        await redisClient!.set(key, serialized);
      }
    } catch {
      // Silently ignore cache write failures
    }
  },

  /**
   * Delete cached value
   */
  async del(key: string): Promise<void> {
    if (!isRedisAvailable()) return;
    try {
      await redisClient!.del(key);
    } catch {
      // Silently ignore
    }
  },

  /**
   * Delete all keys matching pattern
   */
  async delPattern(pattern: string): Promise<void> {
    if (!isRedisAvailable()) return;
    try {
      const keys = await redisClient!.keys(pattern);
      if (keys.length > 0) {
        await redisClient!.del(...keys);
      }
    } catch {
      // Silently ignore
    }
  },

  /**
   * Get or set with callback (cache-aside pattern)
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number = 300,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fetchFn();
    await this.set(key, value, ttl);
    return value;
  },

  // Cache key generators
  keys: {
    strategies: (filters?: Record<string, unknown>) =>
      `strategies:${JSON.stringify(filters ?? {})}`,
    strategy: (hash: string) => `strategy:${hash}`,
    positions: (wallet: string) => `positions:${wallet.toLowerCase()}`,
    tokens: (chain?: string) => `tokens:${chain ?? "all"}`,
    metrics: (chain?: string) => `metrics:${chain ?? "all"}`,
    swapQuote: (params: Record<string, unknown>) =>
      `quote:${JSON.stringify(params)}`,
  },

  // TTL values (in seconds)
  ttl: {
    short: 30, // 30 seconds (for rapidly changing data)
    medium: 300, // 5 minutes (for moderately changing data)
    long: 3600, // 1 hour (for slowly changing data)
    day: 86400, // 24 hours (for static data)
  },
};
