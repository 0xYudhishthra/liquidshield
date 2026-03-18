// ============================================
// Ponder Database Client
// Read-only access to indexed on-chain data
//
// Graceful degradation: if Ponder DB is unavailable
// (missing env var, connection refused, tables not yet
// created), all queries return empty results instead
// of crashing the API server.
// ============================================

import postgres from "postgres";

// Singleton instance
let ponderSql: ReturnType<typeof postgres> | null = null;
let ponderAvailable = true;

/**
 * Get the Ponder database connection (singleton).
 * Returns null if PONDER_DATABASE_URL is not set.
 */
export function getPonderDb(): ReturnType<typeof postgres> | null {
  if (!ponderAvailable) return null;

  if (!ponderSql) {
    const connectionString = process.env.PONDER_DATABASE_URL;

    if (!connectionString) {
      console.warn(
        "[ponder] PONDER_DATABASE_URL not set — Ponder queries will return empty results",
      );
      ponderAvailable = false;
      return null;
    }

    ponderSql = postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }

  return ponderSql;
}

/**
 * Safe query wrapper — catches connection/table errors and returns fallback.
 */
async function safeQuery<T>(
  fn: (sql: ReturnType<typeof postgres>) => Promise<T>,
  fallback: T,
): Promise<T> {
  const sql = getPonderDb();
  if (!sql) return fallback;

  try {
    return await fn(sql);
  } catch (err: any) {
    // Log but don't crash — Ponder tables may not exist yet
    const msg = err?.message ?? String(err);
    // Suppress noisy repeat logs for common expected errors
    if (
      msg.includes("does not exist") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("connection refused")
    ) {
      console.warn(`[ponder] query skipped: ${msg.slice(0, 120)}`);
    } else {
      console.error("[ponder] query error:", msg);
    }
    return fallback;
  }
}

/**
 * Ponder database client for on-chain data queries.
 * All methods degrade gracefully when Ponder is unavailable.
 */
export const ponderDb = {
  /** Expose raw sql for advanced queries (null if unavailable) */
  get sql() {
    return getPonderDb();
  },

  // LP Accounts
  async getLPAccountsByOwner(owner: string) {
    return safeQuery(
      (sql) => sql`
        SELECT * FROM lp_account
        WHERE owner = ${owner.toLowerCase()}
        ORDER BY created_at_timestamp DESC
      `,
      [],
    );
  },

  async getLPAccount(address: string, chainId: number) {
    return safeQuery(async (sql) => {
      const [account] = await sql`
        SELECT * FROM lp_account
        WHERE address = ${address.toLowerCase()}
        AND chain_id = ${chainId}
      `;
      return account ?? null;
    }, null);
  },

  // Strategies
  async getStrategies(filters?: {
    chainId?: number;
    app?: string;
    isActive?: boolean;
    tokenIn?: string;
    tokenOut?: string;
  }) {
    return safeQuery((sql) => {
      let query = sql`SELECT * FROM strategy WHERE 1=1`;

      if (filters?.chainId) {
        query = sql`${query} AND chain_id = ${filters.chainId}`;
      }
      if (filters?.app) {
        query = sql`${query} AND app = ${filters.app.toLowerCase()}`;
      }
      if (filters?.isActive !== undefined) {
        query = sql`${query} AND is_active = ${filters.isActive}`;
      }
      if (filters?.tokenIn) {
        query = sql`${query} AND token_in = ${filters.tokenIn.toLowerCase()}`;
      }
      if (filters?.tokenOut) {
        query = sql`${query} AND token_out = ${filters.tokenOut.toLowerCase()}`;
      }

      return sql`${query} ORDER BY registered_at_timestamp DESC`;
    }, []);
  },

  async getStrategy(strategyHash: string) {
    return safeQuery(async (sql) => {
      const [strategy] = await sql`
        SELECT * FROM strategy
        WHERE strategy_hash = ${strategyHash.toLowerCase()}
      `;
      return strategy ?? null;
    }, null);
  },

  // Virtual Balances
  async getVirtualBalances(maker: string, chainId?: number) {
    return safeQuery((sql) => {
      if (chainId) {
        return sql`
          SELECT * FROM virtual_balance
          WHERE maker = ${maker.toLowerCase()}
          AND chain_id = ${chainId}
        `;
      }
      return sql`
        SELECT * FROM virtual_balance
        WHERE maker = ${maker.toLowerCase()}
      `;
    }, []);
  },

  async getVirtualBalancesByStrategy(strategyHash: string) {
    return safeQuery(
      (sql) => sql`
        SELECT * FROM virtual_balance
        WHERE strategy_hash = ${strategyHash.toLowerCase()}
      `,
      [],
    );
  },

  // Swap Events
  async getSwapsByTaker(taker: string, limit: number = 100) {
    return safeQuery(
      (sql) => sql`
        SELECT * FROM swap_event
        WHERE taker = ${taker.toLowerCase()}
        ORDER BY block_timestamp DESC
        LIMIT ${limit}
      `,
      [],
    );
  },

  async getSwapsByMaker(maker: string, limit: number = 100) {
    return safeQuery(
      (sql) => sql`
        SELECT * FROM swap_event
        WHERE maker = ${maker.toLowerCase()}
        ORDER BY block_timestamp DESC
        LIMIT ${limit}
      `,
      [],
    );
  },

  async getSwapsByStrategy(strategyHash: string, limit: number = 100) {
    return safeQuery(
      (sql) => sql`
        SELECT * FROM swap_event
        WHERE strategy_hash = ${strategyHash.toLowerCase()}
        ORDER BY block_timestamp DESC
        LIMIT ${limit}
      `,
      [],
    );
  },

  async getRecentSwaps(chainId?: number, limit: number = 50) {
    return safeQuery((sql) => {
      if (chainId) {
        return sql`
          SELECT * FROM swap_event
          WHERE chain_id = ${chainId}
          ORDER BY block_timestamp DESC
          LIMIT ${limit}
        `;
      }
      return sql`
        SELECT * FROM swap_event
        ORDER BY block_timestamp DESC
        LIMIT ${limit}
      `;
    }, []);
  },

  // Daily Metrics
  async getDailyChainMetrics(chainId: number, days: number = 30) {
    return safeQuery(
      (sql) => sql`
        SELECT * FROM daily_chain_metrics
        WHERE chain_id = ${chainId}
        ORDER BY date DESC
        LIMIT ${days}
      `,
      [],
    );
  },

  async getLatestDailyMetrics(chainId: number) {
    return safeQuery(async (sql) => {
      const [metrics] = await sql`
        SELECT * FROM daily_chain_metrics
        WHERE chain_id = ${chainId}
        ORDER BY date DESC
        LIMIT 1
      `;
      return metrics ?? null;
    }, null);
  },

  // Maker Stats
  async getMakerStats(maker: string, chainId?: number) {
    if (chainId) {
      return safeQuery(async (sql) => {
        const [stats] = await sql`
          SELECT * FROM maker_stats
          WHERE maker = ${maker.toLowerCase()}
          AND chain_id = ${chainId}
        `;
        return stats ?? null;
      }, null);
    }
    return safeQuery(
      (sql) => sql`
        SELECT * FROM maker_stats
        WHERE maker = ${maker.toLowerCase()}
      `,
      [],
    );
  },

  // Strategy Stats
  async getStrategyStats(strategyHash: string, chainId?: number) {
    if (chainId) {
      return safeQuery(async (sql) => {
        const [stats] = await sql`
          SELECT * FROM strategy_stats
          WHERE strategy_hash = ${strategyHash.toLowerCase()}
          AND chain_id = ${chainId}
        `;
        return stats ?? null;
      }, null);
    }
    return safeQuery(
      (sql) => sql`
        SELECT * FROM strategy_stats
        WHERE strategy_hash = ${strategyHash.toLowerCase()}
      `,
      [],
    );
  },

  async getTopStrategies(limit: number = 10) {
    return safeQuery(
      (sql) => sql`
        SELECT * FROM strategy_stats
        ORDER BY total_volume_in DESC
        LIMIT ${limit}
      `,
      [],
    );
  },

  // Rebalance Operations
  async getRebalanceOperations(maker: string, limit: number = 50) {
    return safeQuery(
      (sql) => sql`
        SELECT * FROM rebalance_operation
        WHERE maker = ${maker.toLowerCase()}
        ORDER BY initiated_at DESC
        LIMIT ${limit}
      `,
      [],
    );
  },

  async getPendingRebalances(maker: string) {
    return safeQuery(
      (sql) => sql`
        SELECT * FROM rebalance_operation
        WHERE maker = ${maker.toLowerCase()}
        AND status IN ('pending', 'bridging')
        ORDER BY initiated_at DESC
      `,
      [],
    );
  },

  // Aggregated protocol stats
  async getTotalProtocolStats() {
    return safeQuery(async (sql) => {
      const [stats] = await sql`
        SELECT
          SUM(total_volume_in) as total_volume,
          SUM(total_swaps) as total_swaps,
          SUM(total_fees) as total_fees
        FROM strategy_stats
      `;
      return stats ?? { total_volume: 0n, total_swaps: 0, total_fees: 0n };
    }, { total_volume: 0n, total_swaps: 0, total_fees: 0n });
  },

  async getTotalVTVL() {
    return safeQuery(async (sql) => {
      const [result] = await sql`
        SELECT SUM(balance) as total_vtvl
        FROM virtual_balance
      `;
      return result?.total_vtvl ?? 0n;
    }, 0n);
  },
};
