// ============================================
// Supabase Database Types
// Generated from supabase_schema.sql
// ============================================

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          wallet_address: string;
          world_id_nullifier: string | null;
          world_id_verified: boolean;
          world_id_verified_at: string | null;
          created_at: string;
          last_seen_at: string;
        };
        Insert: {
          id?: string;
          wallet_address: string;
          world_id_nullifier?: string | null;
          world_id_verified?: boolean;
          world_id_verified_at?: string | null;
          created_at?: string;
          last_seen_at?: string;
        };
        Update: {
          id?: string;
          wallet_address?: string;
          world_id_nullifier?: string | null;
          world_id_verified?: boolean;
          world_id_verified_at?: string | null;
          created_at?: string;
          last_seen_at?: string;
        };
      };
      user_preferences: {
        Row: {
          user_id: string;
          default_slippage_bps: number;
          preferred_chains: string[];
          theme: string;
          notifications_enabled: boolean;
          notification_email: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          default_slippage_bps?: number;
          preferred_chains?: string[];
          theme?: string;
          notifications_enabled?: boolean;
          notification_email?: string | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          default_slippage_bps?: number;
          preferred_chains?: string[];
          theme?: string;
          notifications_enabled?: boolean;
          notification_email?: string | null;
          updated_at?: string;
        };
      };
      tokens: {
        Row: {
          id: string;
          address: string;
          chain: string;
          symbol: string;
          name: string;
          decimals: number;
          logo_url: string | null;
          coingecko_id: string | null;
          is_stablecoin: boolean;
          is_native_wrapper: boolean;
          is_active: boolean;
          price_usd: number | null;
          price_updated_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          address: string;
          chain: string;
          symbol: string;
          name: string;
          decimals?: number;
          logo_url?: string | null;
          coingecko_id?: string | null;
          is_stablecoin?: boolean;
          is_native_wrapper?: boolean;
          is_active?: boolean;
          price_usd?: number | null;
          price_updated_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          address?: string;
          chain?: string;
          symbol?: string;
          name?: string;
          decimals?: number;
          logo_url?: string | null;
          coingecko_id?: string | null;
          is_stablecoin?: boolean;
          is_native_wrapper?: boolean;
          is_active?: boolean;
          price_usd?: number | null;
          price_updated_at?: string | null;
          created_at?: string;
        };
      };
      strategy_metadata: {
        Row: {
          strategy_hash: string;
          strategy_type: string;
          display_name: string | null;
          description: string | null;
          risk_level: string;
          amplification_factor: number | null;
          price_lower: number | null;
          price_upper: number | null;
          fee_bps: number | null;
          range_multiplier: number | null;
          token_in: string | null;
          token_out: string | null;
          linear_width: string | null;
          rate0: string | null;
          rate1: string | null;
          program_bytecode: string | null;
          underlying_protocol: string | null;
          underlying_pool_address: string | null;
          hooks_address: string | null;
          supported_chains: string[];
          is_featured: boolean;
          is_proprietary: boolean;
          is_deprecated: boolean;
          apy_24h: number | null;
          apy_7d: number | null;
          apy_30d: number | null;
          tvl_usd: number | null;
          volume_24h_usd: number | null;
          volume_to_tvl_ratio: number | null;
          last_computed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          strategy_hash: string;
          strategy_type: string;
          display_name?: string | null;
          description?: string | null;
          risk_level?: string;
          amplification_factor?: number | null;
          price_lower?: number | null;
          price_upper?: number | null;
          fee_bps?: number | null;
          range_multiplier?: number | null;
          token_in?: string | null;
          token_out?: string | null;
          linear_width?: string | null;
          rate0?: string | null;
          rate1?: string | null;
          program_bytecode?: string | null;
          underlying_protocol?: string | null;
          underlying_pool_address?: string | null;
          hooks_address?: string | null;
          supported_chains?: string[];
          is_featured?: boolean;
          is_proprietary?: boolean;
          is_deprecated?: boolean;
          apy_24h?: number | null;
          apy_7d?: number | null;
          apy_30d?: number | null;
          tvl_usd?: number | null;
          volume_24h_usd?: number | null;
          volume_to_tvl_ratio?: number | null;
          last_computed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          strategy_hash?: string;
          strategy_type?: string;
          display_name?: string | null;
          description?: string | null;
          risk_level?: string;
          amplification_factor?: number | null;
          price_lower?: number | null;
          price_upper?: number | null;
          fee_bps?: number | null;
          range_multiplier?: number | null;
          token_in?: string | null;
          token_out?: string | null;
          linear_width?: string | null;
          rate0?: string | null;
          rate1?: string | null;
          program_bytecode?: string | null;
          underlying_protocol?: string | null;
          underlying_pool_address?: string | null;
          hooks_address?: string | null;
          supported_chains?: string[];
          is_featured?: boolean;
          is_proprietary?: boolean;
          is_deprecated?: boolean;
          apy_24h?: number | null;
          apy_7d?: number | null;
          apy_30d?: number | null;
          tvl_usd?: number | null;
          volume_24h_usd?: number | null;
          volume_to_tvl_ratio?: number | null;
          last_computed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      positions: {
        Row: {
          id: string;
          lp_account_address: string;
          strategy_hash: string;
          chain: string;
          owner_address: string;
          token_address: string;
          app: string | null;
          balance_raw: string;
          balance_usd: number | null;
          deposited_usd: number | null;
          earned_fees_usd: number | null;
          pnl_usd: number | null;
          pnl_percentage: number | null;
          is_active: boolean;
          last_synced_block: number | null;
          last_synced_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lp_account_address: string;
          strategy_hash: string;
          chain: string;
          owner_address: string;
          token_address: string;
          app?: string | null;
          balance_raw: string;
          balance_usd?: number | null;
          deposited_usd?: number | null;
          earned_fees_usd?: number | null;
          pnl_usd?: number | null;
          pnl_percentage?: number | null;
          is_active?: boolean;
          last_synced_block?: number | null;
          last_synced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          lp_account_address?: string;
          strategy_hash?: string;
          chain?: string;
          owner_address?: string;
          token_address?: string;
          app?: string | null;
          balance_raw?: string;
          balance_usd?: number | null;
          deposited_usd?: number | null;
          earned_fees_usd?: number | null;
          pnl_usd?: number | null;
          pnl_percentage?: number | null;
          is_active?: boolean;
          last_synced_block?: number | null;
          last_synced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      rebalancer_configs: {
        Row: {
          id: string;
          lp_account_address: string;
          owner_address: string;
          is_enabled: boolean;
          rebalancer_address: string | null;
          min_rebalance_amount_usd: number;
          max_slippage_bps: number;
          preferred_source_chain: string | null;
          min_hours_between_rebalances: number;
          last_rebalance_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lp_account_address: string;
          owner_address: string;
          is_enabled?: boolean;
          rebalancer_address?: string | null;
          min_rebalance_amount_usd?: number;
          max_slippage_bps?: number;
          preferred_source_chain?: string | null;
          min_hours_between_rebalances?: number;
          last_rebalance_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          lp_account_address?: string;
          owner_address?: string;
          is_enabled?: boolean;
          rebalancer_address?: string | null;
          min_rebalance_amount_usd?: number;
          max_slippage_bps?: number;
          preferred_source_chain?: string | null;
          min_hours_between_rebalances?: number;
          last_rebalance_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      protocol_metrics_daily: {
        Row: {
          id: string;
          metric_date: string;
          chain: string | null;
          total_vtvl_usd: number;
          trading_volume_usd: number;
          swap_count: number;
          total_lp_accounts: number;
          active_lp_accounts: number;
          new_lp_accounts: number;
          protocol_fees_usd: number;
          lp_fees_usd: number;
          volume_to_tvl_ratio: number | null;
          cross_chain_volume_usd: number;
          bridge_operations: number;
          daily_active_users: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          metric_date: string;
          chain?: string | null;
          total_vtvl_usd?: number;
          trading_volume_usd?: number;
          swap_count?: number;
          total_lp_accounts?: number;
          active_lp_accounts?: number;
          new_lp_accounts?: number;
          protocol_fees_usd?: number;
          lp_fees_usd?: number;
          volume_to_tvl_ratio?: number | null;
          cross_chain_volume_usd?: number;
          bridge_operations?: number;
          daily_active_users?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          metric_date?: string;
          chain?: string | null;
          total_vtvl_usd?: number;
          trading_volume_usd?: number;
          swap_count?: number;
          total_lp_accounts?: number;
          active_lp_accounts?: number;
          new_lp_accounts?: number;
          protocol_fees_usd?: number;
          lp_fees_usd?: number;
          volume_to_tvl_ratio?: number | null;
          cross_chain_volume_usd?: number;
          bridge_operations?: number;
          daily_active_users?: number;
          created_at?: string;
        };
      };
      token_price_history: {
        Row: {
          id: string;
          token_id: string;
          price_usd: number;
          recorded_at: string;
        };
        Insert: {
          id?: string;
          token_id: string;
          price_usd: number;
          recorded_at: string;
        };
        Update: {
          id?: string;
          token_id?: string;
          price_usd?: number;
          recorded_at?: string;
        };
      };
    };
    Views: {};
    Functions: {};
    Enums: {
      chain_id: "base" | "unichain";
      strategy_type:
        | "constant_product"
        | "stable_swap"
        | "custom"
        | "stableswap"
        | "concentrated"
        | "third_party_uniswap"
        | "third_party_curve"
        | "third_party_aerodrome";
      risk_level: "low" | "medium" | "high";
    };
  };
};
