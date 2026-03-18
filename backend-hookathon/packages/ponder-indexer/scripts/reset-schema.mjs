#!/usr/bin/env node

/**
 * Drops the Ponder schema from the database so a fresh reindex can start.
 * Used as a pre-deploy step on Railway when schema changes cause:
 *   "Schema was previously used by a different Ponder app"
 *
 * Usage:
 *   node scripts/reset-schema.mjs
 *
 * Requires PONDER_DATABASE_URL env var (standard Railway Postgres connection string).
 * Reads DATABASE_SCHEMA env var for the schema name (defaults to 'aqua0-ponder-staging').
 * Runs automatically before `ponder start` on every deploy.
 */

import pg from 'pg';

const schemaName = process.env.DATABASE_SCHEMA || 'aqua0-ponder-staging';
const databaseUrl = process.env.PONDER_DATABASE_URL;

if (!databaseUrl) {
  console.error('PONDER_DATABASE_URL is not set. Skipping schema reset.');
  process.exit(0);
}

const client = new pg.Client({ connectionString: databaseUrl });

try {
  await client.connect();
  console.log(`Dropping schema "${schemaName}" ...`);
  await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  console.log(`Schema "${schemaName}" dropped successfully. Ponder will recreate it on start.`);
} catch (err) {
  console.error('Failed to drop schema:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
