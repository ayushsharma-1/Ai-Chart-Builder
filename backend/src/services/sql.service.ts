import pool from '../config/db';
import { QUERY_TIMEOUT_MS, validateSql } from '../utils/sqlGuard';

export interface QueryResult {
  data: unknown[];
  rowCount: number;
  executionTimeMs: number;
  cacheStatus?: 'miss' | 'hit' | 'stale';
}

interface QueryCacheEntry {
  data: unknown[];
  rowCount: number;
  createdAt: number;
}

interface RunQueryOptions {
  cacheKey?: string;
  ttlSeconds?: number;
  staleWhileRevalidateSeconds?: number;
}

const queryCache = new Map<string, QueryCacheEntry>();

function buildCacheKey(sql: string, params: unknown[]) {
  return `${sql}::${JSON.stringify(params)}`;
}

export async function runQuery(sql: string, params: unknown[] = [], options: RunQueryOptions = {}): Promise<QueryResult> {
  const guard = validateSql(sql);

  if (!guard.safe || !guard.sanitizedSql) {
    throw new Error(`Query blocked: ${guard.reason || 'unknown reason'}`);
  }

  const ttlSeconds = options.ttlSeconds ?? 0;
  const staleWhileRevalidateSeconds = options.staleWhileRevalidateSeconds ?? 0;
  const cacheKey = ttlSeconds > 0 ? options.cacheKey || buildCacheKey(guard.sanitizedSql, params) : null;
  const cached = cacheKey ? queryCache.get(cacheKey) : null;
  const now = Date.now();

  if (cached) {
    const ageSeconds = (now - cached.createdAt) / 1000;

    if (ageSeconds <= ttlSeconds) {
      return {
        data: cached.data,
        rowCount: cached.rowCount,
        executionTimeMs: 0,
        cacheStatus: 'hit',
      };
    }

    if (ageSeconds <= ttlSeconds + staleWhileRevalidateSeconds) {
      void runQuery(sql, params, { ...options, staleWhileRevalidateSeconds: 0 }).catch((error) => {
        console.error('[SQL] Background cache refresh failed', error?.message || error);
      });

      return {
        data: cached.data,
        rowCount: cached.rowCount,
        executionTimeMs: 0,
        cacheStatus: 'stale',
      };
    }
  }

  const start = Date.now();
  const connection = await pool.getConnection();

  try {
    console.info('[SQL] Executing query:', guard.sanitizedSql);
    await connection.query(`SET SESSION MAX_EXECUTION_TIME=${QUERY_TIMEOUT_MS}`);
    const [rows] = await connection.query(guard.sanitizedSql, params);
    const data = rows as unknown[];
    const executionTimeMs = Date.now() - start;

    console.info('[SQL] Query completed', {
      rowCount: data.length,
      executionTimeMs,
    });

    if (cacheKey) {
      queryCache.set(cacheKey, {
        data,
        rowCount: data.length,
        createdAt: Date.now(),
      });
    }

    return {
      data,
      rowCount: data.length,
      executionTimeMs,
      cacheStatus: cacheKey ? 'miss' : undefined,
    };
  } catch (error: any) {
    console.error('[SQL] Query failed', {
      sql: guard.sanitizedSql,
      message: error?.message,
      code: error?.code,
      errno: error?.errno,
      sqlState: error?.sqlState,
    });

    throw new Error(error?.message || 'Query execution failed');
  } finally {
    connection.release();
  }
}
