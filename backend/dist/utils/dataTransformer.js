"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDataProfile = buildDataProfile;
function detectColumnType(value) {
    if (value === null || value === undefined)
        return 'null';
    if (typeof value === 'boolean')
        return 'boolean';
    if (typeof value === 'number')
        return 'number';
    if (typeof value === 'string') {
        if (/^\d{4}-\d{2}(-\d{2})?$/.test(value))
            return 'date';
        if (!isNaN(Number(value)) && value.trim() !== '')
            return 'number';
        return 'string';
    }
    return 'string';
}
function isDateLikeValue(value) {
    if (typeof value !== 'string')
        return false;
    return /^\d{4}-\d{2}(-\d{2})?$/.test(value);
}
function buildDataProfile(data) {
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
    const firstRow = data[0];
    const columnNames = Object.keys(firstRow);
    const warnings = [];
    const columns = columnNames.map(name => {
        const allValues = data.map(row => row[name]);
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
        let min;
        let max;
        if (type === 'number') {
            const nums = nonNullValues.map(v => Number(v)).filter(n => !isNaN(n));
            if (nums.length > 0) {
                min = Math.min(...nums);
                max = Math.max(...nums);
            }
        }
        // Monotonic check (for time series detection)
        let isMonotonic;
        if (type === 'date' || type === 'number') {
            const vals = nonNullValues.map(v => type === 'number' ? Number(v) : String(v));
            isMonotonic = vals.every((v, i) => i === 0 || v >= vals[i - 1]);
        }
        const isDateLike = nonNullValues.some(v => isDateLikeValue(v));
        return { name, type, cardinality, nullCount, sampleValues, isMonotonic, min, max, isDateLike };
    });
    // Profile-level computed fields
    const hasTimeSeriesColumn = columns.some(c => c.isDateLike || c.type === 'date');
    const hasNumericMetric = columns.some(c => c.type === 'number');
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
