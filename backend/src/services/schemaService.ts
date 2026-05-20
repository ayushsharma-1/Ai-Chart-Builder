import pool from '../config/db';
import { getRelevantSchemaContext } from '../utils/dataModel';

export interface ColumnMetadata {
  columnName: string;
  dataType: string;          // varchar, int, decimal, text, datetime, etc.
  isNullable: boolean;
  columnKey: string;         // PRI, MUL, UNI, or ''
  columnDefault: string | null;
  characterMaxLength: number | null;
  numericPrecision: number | null;
  extra: string;             // auto_increment, etc.
}

export interface TableSchema {
  tableName: string;
  columns: ColumnMetadata[];
  primaryKey: string | null;
  foreignKeys: Array<{ column: string; referencedTable: string; referencedColumn: string }>;
  rowCount?: number;         // approximate from information_schema
}

export interface SchemaSnapshot {
  tables: TableSchema[];
  fetchedAt: number;         // unix ms
  warnings: string[];        // e.g. VARCHAR monetary fields detected
  fallbackContext?: string;  // populated when INFORMATION_SCHEMA is unavailable
}

// Cache keyed by sorted table name set, TTL = 10 minutes
const schemaCache = new Map<string, { snapshot: SchemaSnapshot; expiresAt: number }>();
const SCHEMA_TTL_MS = 10 * 60 * 1000;

const ALLOWED_TABLES = new Set(['tblcandidate', 'tblassignjobcandidate', 'tbldeals', 'tbljob']);

const COLUMN_BLACKLIST: Record<string, string[]> = {
  tblassignjobcandidate: ['deleted', 'archived'],
};

// Columns that must never appear in LLM schema context (PII)
const EXCLUDED_COLUMNS = new Set([
  'emailid', 'contactnumber', 'formatted_contact_number',
  'password', 'password_hash', 'token', 'api_key', 'secret',
]);

function buildCacheKey(tables: string[]): string {
  return [...tables].sort().join(':');
}

async function fetchColumnMetadata(tables: string[]): Promise<Map<string, ColumnMetadata[]>> {
  const placeholders = tables.map(() => '?').join(',');
  const dbName = process.env.DB_NAME!;

  const [rows] = await pool.query(`
    SELECT
      TABLE_NAME       AS tableName,
      COLUMN_NAME      AS columnName,
      DATA_TYPE        AS dataType,
      IS_NULLABLE      AS isNullable,
      COLUMN_KEY       AS columnKey,
      COLUMN_DEFAULT   AS columnDefault,
      CHARACTER_MAXIMUM_LENGTH AS characterMaxLength,
      NUMERIC_PRECISION        AS numericPrecision,
      EXTRA                    AS extra
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = ?
      AND TABLE_NAME IN (${placeholders})
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  `, [dbName, ...tables]);

  const result = new Map<string, ColumnMetadata[]>();

  for (const row of rows as any[]) {
    const tableName = String(row.tableName || '').toLowerCase();
    const columnName = String(row.columnName || '').toLowerCase();

    if (EXCLUDED_COLUMNS.has(columnName)) continue;

    const blockedColumns = COLUMN_BLACKLIST[tableName] || [];
    if (blockedColumns.includes(columnName)) continue;

    if (!result.has(row.tableName)) result.set(row.tableName, []);

    result.get(row.tableName)!.push({
      columnName: row.columnName,
      dataType: row.dataType,
      isNullable: row.isNullable === 'YES',
      columnKey: row.columnKey || '',
      columnDefault: row.columnDefault,
      characterMaxLength: row.characterMaxLength,
      numericPrecision: row.numericPrecision,
      extra: row.extra || '',
    });
  }

  return result;
}

async function fetchForeignKeys(tables: string[]): Promise<Map<string, Array<{ column: string; referencedTable: string; referencedColumn: string }>>> {
  const placeholders = tables.map(() => '?').join(',');
  const dbName = process.env.DB_NAME!;

  const [rows] = await pool.query(`
    SELECT
      kcu.TABLE_NAME        AS tableName,
      kcu.COLUMN_NAME       AS columnName,
      kcu.REFERENCED_TABLE_NAME  AS referencedTable,
      kcu.REFERENCED_COLUMN_NAME AS referencedColumn
    FROM information_schema.KEY_COLUMN_USAGE kcu
    WHERE kcu.TABLE_SCHEMA = ?
      AND kcu.TABLE_NAME IN (${placeholders})
      AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
      AND kcu.REFERENCED_TABLE_NAME IN (${placeholders})
  `, [dbName, ...tables, ...tables]);

  const result = new Map<string, Array<{ column: string; referencedTable: string; referencedColumn: string }>>();
  for (const row of rows as any[]) {
    if (!result.has(row.tableName)) result.set(row.tableName, []);
    result.get(row.tableName)!.push({
      column: row.columnName,
      referencedTable: row.referencedTable,
      referencedColumn: row.referencedColumn,
    });
  }
  return result;
}

async function fetchApproxRowCounts(tables: string[]): Promise<Map<string, number>> {
  const placeholders = tables.map(() => '?').join(',');
  const dbName = process.env.DB_NAME!;

  const [rows] = await pool.query(`
    SELECT TABLE_NAME AS tableName, TABLE_ROWS AS approxRows
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (${placeholders})
  `, [dbName, ...tables]);

  const result = new Map<string, number>();
  for (const row of rows as any[]) {
    result.set(row.tableName, row.approxRows || 0);
  }
  return result;
}

function detectWarnings(tables: TableSchema[]): string[] {
  const warnings: string[] = [];

  for (const table of tables) {
    for (const col of table.columns) {
      // Detect VARCHAR monetary fields — warn so LLM knows to sanitize
      if (
        col.dataType === 'varchar' &&
        (col.columnName.includes('amount') || col.columnName.includes('value') || col.columnName.includes('billing'))
      ) {
        warnings.push(`${table.tableName}.${col.columnName} is VARCHAR — use CAST(REPLACE(col,',','') AS DECIMAL(15,2)) for numeric ops`);
      }

      // Detect nullable fields commonly used in aggregations
      if (col.isNullable && ['billingamount', 'dealvalue', 'total', 'billingvalue'].includes(col.columnName)) {
        warnings.push(`${table.tableName}.${col.columnName} is nullable — wrap in COALESCE when aggregating`);
      }
    }
  }

  return warnings;
}

export async function getSchemaForTables(tableNames: string[]): Promise<SchemaSnapshot> {
  // Validate — only allow whitelisted tables
  const safeTables = tableNames.filter(t => ALLOWED_TABLES.has(t.toLowerCase()));
  if (safeTables.length === 0) {
    throw new Error('No valid tables requested from schema service');
  }

  const cacheKey = buildCacheKey(safeTables);
  const cached = schemaCache.get(cacheKey);

  if (cached && Date.now() < cached.expiresAt) {
    return cached.snapshot;
  }

  // Attempt INFORMATION_SCHEMA fetch with fallback to dataModel.ts
  try {
    const [columnMap, fkMap, rowCountMap] = await Promise.all([
      fetchColumnMetadata(safeTables),
      fetchForeignKeys(safeTables),
      fetchApproxRowCounts(safeTables),
    ]);

    const tables: TableSchema[] = safeTables.map(tableName => {
      const columns = columnMap.get(tableName) || [];
      const foreignKeys = fkMap.get(tableName) || [];
      const primaryKey = columns.find(c => c.columnKey === 'PRI')?.columnName || null;

      return {
        tableName,
        columns,
        primaryKey,
        foreignKeys,
        rowCount: rowCountMap.get(tableName),
      };
    });

    const snapshot: SchemaSnapshot = {
      tables,
      fetchedAt: Date.now(),
      warnings: detectWarnings(tables),
    };

    schemaCache.set(cacheKey, { snapshot, expiresAt: Date.now() + SCHEMA_TTL_MS });

    return snapshot;
  } catch (err: any) {
    console.warn('[SchemaService] INFORMATION_SCHEMA query failed, using dataModel fallback:', err.message);

    // Graceful fallback — use the existing static dataModel.ts schema context
    const fallbackSnapshot: SchemaSnapshot = {
      tables: safeTables.map(name => ({
        tableName: name,
        columns: [],
        primaryKey: null,
        foreignKeys: [],
      })),
      fetchedAt: Date.now(),
      warnings: ['Schema service unavailable — using fallback schema context'],
      fallbackContext: getRelevantSchemaContext(safeTables.join(' ')),
    };

    // Cache the fallback too (shorter TTL) to avoid hammering a broken connection
    schemaCache.set(cacheKey, { snapshot: fallbackSnapshot, expiresAt: Date.now() + 60_000 });

    return fallbackSnapshot;
  }
}

/** Formats SchemaSnapshot into a compact LLM-ready string */
export function formatSchemaForPrompt(snapshot: SchemaSnapshot): string {
  // If we have a fallback context from dataModel.ts, use that directly
  if (snapshot.fallbackContext) return snapshot.fallbackContext;

  const lines: string[] = ['LIVE SCHEMA (from database):'];

  for (const table of snapshot.tables) {
    const colList = table.columns
      .map(c => {
        const parts = [c.columnName, c.dataType];
        if (c.columnKey === 'PRI') parts.push('PK');
        if (c.columnKey === 'MUL') parts.push('FK');
        if (!c.isNullable) parts.push('NOT NULL');
        return parts.join(' ');
      })
      .join(', ');

    lines.push(`${table.tableName}(${colList})`);

    if (table.foreignKeys.length > 0) {
      const fkLines = table.foreignKeys.map(fk => `  FK: ${fk.column} → ${fk.referencedTable}.${fk.referencedColumn}`);
      lines.push(...fkLines);
    }

    if (table.rowCount !== undefined) {
      lines.push(`  ~${table.rowCount.toLocaleString()} rows`);
    }
  }

  if (snapshot.warnings.length > 0) {
    lines.push('SCHEMA WARNINGS:');
    snapshot.warnings.forEach(w => lines.push(`  ⚠ ${w}`));
  }

  return lines.join('\n');
}
