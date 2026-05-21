export type ColumnType = 'number' | 'string' | 'date' | 'boolean' | 'null';

export interface ColumnProfile {
  name: string;
  type: ColumnType;
  cardinality: number;        // distinct value count
  nullCount: number;
  sampleValues: unknown[];    // first 5 distinct values
  isMonotonic?: boolean;      // for dates/numbers — are they sorted?
  min?: number;
  max?: number;
  isDateLike?: boolean;       // matches YYYY-MM or YYYY-MM-DD pattern
  isIdentifier: boolean;      // true for identifier / foreign-key columns
}

export interface DataProfile {
  rowCount: number;
  columns: ColumnProfile[];
  hasTimeSeriesColumn: boolean;     // at least one date-like column
  hasNumericMetric: boolean;        // at least one numeric column
  maxCardinality: number;           // highest cardinality across string columns
  isSingleRow: boolean;             // only 1 row returned (scalar result)
  isHighCardinality: boolean;       // any string column > 30 unique values
  warnings: string[];
}

function detectColumnType(value: unknown): ColumnType {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}(-\d{2})?$/.test(value)) return 'date';
    if (!isNaN(Number(value)) && value.trim() !== '') return 'number';
    return 'string';
  }
  return 'string';
}

function isDateLikeValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /^\d{4}-\d{2}(-\d{2})?$/.test(value);
}

function isIdentifierColumn(columnName: string): boolean {
  const lower = columnName.toLowerCase();
  return (
    lower === 'id' ||
    lower.endsWith('_id') ||
    (lower.endsWith('id') && (
      lower.includes('owner') ||
      lower.includes('recruiter') ||
      lower.includes('candidate') ||
      lower.includes('job') ||
      lower.includes('company') ||
      lower.includes('account') ||
      lower.includes('contact') ||
      lower.includes('client') ||
      lower.includes('user')
    ))
  );
}

export function buildDataProfile(data: unknown[]): DataProfile {
  if (data.length === 0) {
    return {
      rowCount: 0,
      columns: [],
      hasTimeSeriesColumn: false,
      hasNumericMetric: false,
      maxCardinality: 0,
      isSingleRow: false,
      isHighCardinality: false,
      warnings: ['Query returned no data'],
    };
  }

  const firstRow = data[0] as Record<string, unknown>;
  const columnNames = Object.keys(firstRow);
  const warnings: string[] = [];

  const columns: ColumnProfile[] = columnNames.map(name => {
    const allValues = data.map(row => (row as Record<string, unknown>)[name]);
    const nonNullValues = allValues.filter(v => v !== null && v !== undefined);
    const nullCount = allValues.length - nonNullValues.length;

    // Detect type from first non-null value
    const type = nonNullValues.length > 0 ? detectColumnType(nonNullValues[0]) : 'null';

    // Cardinality
    const distinctValues = new Set(nonNullValues.map(v => String(v)));
    const cardinality = distinctValues.size;

    // Sample values (first 5 distinct)
    const sampleValues = Array.from(distinctValues).slice(0, 5);

    // Numeric range
    let min: number | undefined;
    let max: number | undefined;
    if (type === 'number') {
      const nums = nonNullValues.map(v => Number(v)).filter(n => !isNaN(n));
      if (nums.length > 0) {
        min = Math.min(...nums);
        max = Math.max(...nums);
      }
    }

    // Monotonic check (for time series detection)
    let isMonotonic: boolean | undefined;
    if (type === 'date' || type === 'number') {
      const vals = nonNullValues.map(v => type === 'number' ? Number(v) : String(v));
      isMonotonic = vals.every((v, i) => i === 0 || v >= vals[i - 1]);
    }

    const isDateLike = nonNullValues.some(v => isDateLikeValue(v));
    const isIdentifier = isIdentifierColumn(name);

    return { name, type, cardinality, nullCount, sampleValues, isMonotonic, min, max, isDateLike, isIdentifier };
  });

  // Profile-level computed fields
  const hasTimeSeriesColumn = columns.some(c => c.isDateLike || c.type === 'date');
  const hasNumericMetric = columns.some(c => c.type === 'number' && !c.isIdentifier);
  const stringColumns = columns.filter(c => c.type === 'string');
  const maxCardinality = stringColumns.reduce((max, c) => Math.max(max, c.cardinality), 0);
  const isHighCardinality = maxCardinality > 30;

  if (isHighCardinality) {
    warnings.push(`High cardinality detected (${maxCardinality} unique values) — bar/line chart not recommended`);
  }

  if (!hasNumericMetric) {
    warnings.push('No numeric columns detected — table view recommended');
  }

  return {
    rowCount: data.length,
    columns,
    hasTimeSeriesColumn,
    hasNumericMetric,
    maxCardinality,
    isSingleRow: data.length === 1,
    isHighCardinality,
    warnings,
  };
}
