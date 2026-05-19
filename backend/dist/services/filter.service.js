"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProjectedAliases = getProjectedAliases;
exports.applyDashboardFilters = applyDashboardFilters;
exports.getDashboardFilterTargets = getDashboardFilterTargets;
const sqlGuard_1 = require("../utils/sqlGuard");
const FILTER_TARGETS = [
    {
        field: 'date',
        aliases: ['date', 'created_date', 'created_month', 'month', 'created_at', 'closed_date', 'job_posting_date', 'updated_date'],
        preferredOperator: 'between',
    },
    {
        field: 'owner',
        aliases: ['owner', 'ownerid', 'owner_id', 'owner_name', 'assigned_owner'],
        preferredOperator: 'contains',
    },
    {
        field: 'company',
        aliases: ['company', 'companyname', 'company_name', 'client', 'client_name', 'relatedcompany', 'companyid'],
        preferredOperator: 'contains',
    },
    {
        field: 'stage',
        aliases: ['stage', 'dealstage', 'deal_stage', 'candidate_stage', 'candidatestatusid', 'candidate_status'],
        preferredOperator: 'contains',
    },
    {
        field: 'job_status',
        aliases: ['job_status', 'jobstatus', 'status', 'jobpostingstatus', 'posting_status'],
        preferredOperator: 'contains',
    },
];
function isBlank(value) {
    return value === null || value === undefined || value === '';
}
function normalizeFilterValue(value) {
    if (typeof value === 'string') {
        return value.trim();
    }
    return value;
}
function normalizeIdentifier(value) {
    return value.replace(/[`"'[\]]/g, '').trim().toLowerCase();
}
function isQuotedDelimiter(character) {
    return character === '\'' || character === '"' || character === '`';
}
function advanceDepth(depth, character) {
    if (character === '(') {
        return depth + 1;
    }
    if (character === ')') {
        return Math.max(0, depth - 1);
    }
    return depth;
}
function isKeywordBoundary(sql, index, targetLength) {
    const previous = sql[index - 1] || ' ';
    const next = sql[index + targetLength] || ' ';
    return /\s/.test(previous) && /\s/.test(next);
}
function isTopLevelKeywordAt(sql, target, index) {
    return sql.slice(index, index + target.length).toLowerCase() === target && isKeywordBoundary(sql, index, target.length);
}
function buildBetweenClause(column, value) {
    if (!Array.isArray(value) || value.length !== 2 || isBlank(value[0]) || isBlank(value[1])) {
        return null;
    }
    const isMonthAlias = /month/i.test(column);
    const leftValue = isMonthAlias && typeof value[0] === 'string' ? value[0].slice(0, 7) : value[0];
    const rightValue = isMonthAlias && typeof value[1] === 'string' ? value[1].slice(0, 7) : value[1];
    return {
        sql: `${column} BETWEEN ? AND ?`,
        params: [leftValue, rightValue],
    };
}
function buildContainsClause(column, value) {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
        return null;
    }
    return {
        sql: `CAST(${column} AS CHAR) LIKE ?`,
        params: [`%${String(value)}%`],
    };
}
function buildComparisonClause(column, value, operator) {
    return {
        sql: `${column} ${operator === 'gte' ? '>=' : '<='} ?`,
        params: [value],
    };
}
function buildEqualityClause(column, value) {
    return {
        sql: `${column} = ?`,
        params: [value],
    };
}
function findTopLevelKeyword(sql, keyword, startIndex = 0) {
    let depth = 0;
    let quote = null;
    const target = keyword.toLowerCase();
    for (let index = startIndex; index < sql.length; index += 1) {
        const character = sql[index];
        if (quote) {
            if (character === quote && sql[index - 1] !== '\\') {
                quote = null;
            }
            continue;
        }
        if (isQuotedDelimiter(character)) {
            quote = character;
            continue;
        }
        depth = advanceDepth(depth, character);
        if (depth === 0 && isTopLevelKeywordAt(sql, target, index)) {
            return index;
        }
    }
    return -1;
}
function splitTopLevelCsv(value) {
    const parts = [];
    let depth = 0;
    let quote = null;
    let start = 0;
    for (let index = 0; index < value.length; index += 1) {
        const character = value[index];
        if (quote) {
            if (character === quote && value[index - 1] !== '\\') {
                quote = null;
            }
            continue;
        }
        if (isQuotedDelimiter(character)) {
            quote = character;
            continue;
        }
        depth = advanceDepth(depth, character);
        if (character === ',' && depth === 0) {
            parts.push(value.slice(start, index).trim());
            start = index + 1;
        }
    }
    parts.push(value.slice(start).trim());
    return parts.filter(Boolean);
}
function inferProjectionAlias(expression) {
    const asMatch = /\s+AS\s+(`[^`]+`|"[^"]+"|'[^']+'|\w+)\s*$/i.exec(expression);
    if (asMatch?.[1]) {
        return normalizeIdentifier(asMatch[1]);
    }
    const trailingIdentifier = /(?:^|\.)(`[^`]+`|\w+)\s*$/.exec(expression);
    if (trailingIdentifier?.[1] && !/[()]/.test(expression)) {
        return normalizeIdentifier(trailingIdentifier[1]);
    }
    return null;
}
function getProjectedAliases(sql) {
    const selectIndex = findTopLevelKeyword(` ${sql}`, 'select') - 1;
    const fromIndex = findTopLevelKeyword(sql, 'from');
    if (selectIndex !== 0 || fromIndex <= 0) {
        return [];
    }
    const selectList = sql.slice('select'.length, fromIndex);
    return splitTopLevelCsv(selectList).map(inferProjectionAlias).filter((alias) => Boolean(alias));
}
function resolveFilterAlias(filter, projectedAliases) {
    const target = FILTER_TARGETS.find((candidate) => candidate.field === filter.field);
    if (!target) {
        return null;
    }
    const aliasSet = new Set(projectedAliases.map(normalizeIdentifier));
    return target.aliases.find((alias) => aliasSet.has(normalizeIdentifier(alias))) || null;
}
function buildClause(alias, filter) {
    const value = normalizeFilterValue(filter.value);
    if (isBlank(value)) {
        return null;
    }
    const column = `\`${alias}\``;
    if (filter.operator === 'between') {
        return buildBetweenClause(column, value);
    }
    if (filter.operator === 'contains') {
        return buildContainsClause(column, value);
    }
    if (filter.operator === 'gte') {
        return buildComparisonClause(column, value, 'gte');
    }
    if (filter.operator === 'lte') {
        return buildComparisonClause(column, value, 'lte');
    }
    return buildEqualityClause(column, value);
}
function splitTerminalLimit(sql) {
    const match = /\s+LIMIT\s+\d+\s*$/i.exec(sql);
    if (!match) {
        return {
            innerSql: sql,
            limitClause: '',
        };
    }
    return {
        innerSql: sql.slice(0, match.index).trim(),
        limitClause: match[0].trim(),
    };
}
function applyDashboardFilters(sql, filters = []) {
    const guard = (0, sqlGuard_1.validateSql)(sql);
    if (!guard.safe || !guard.sanitizedSql) {
        throw new Error(`Query blocked before filters: ${guard.reason || 'unknown reason'}`);
    }
    const projectedAliases = getProjectedAliases(guard.sanitizedSql);
    const whereClauses = [];
    const params = [];
    const appliedFilters = [];
    const skippedFilters = [];
    filters.forEach((filter) => {
        if (!filter.enabled) {
            return;
        }
        if (!FILTER_TARGETS.some((target) => target.field === filter.field)) {
            skippedFilters.push({ id: filter.id, label: filter.label, field: filter.field, reason: 'Unsupported filter field.' });
            return;
        }
        const alias = resolveFilterAlias(filter, projectedAliases);
        if (!alias) {
            skippedFilters.push({
                id: filter.id,
                label: filter.label,
                field: filter.field,
                reason: `Chart query does not project a compatible ${filter.label.toLowerCase()} alias.`,
            });
            return;
        }
        const clause = buildClause(alias, filter);
        if (!clause) {
            skippedFilters.push({ id: filter.id, label: filter.label, field: filter.field, reason: 'Filter is enabled but has no usable value.' });
            return;
        }
        whereClauses.push(clause.sql);
        params.push(...clause.params);
        appliedFilters.push({ id: filter.id, label: filter.label, field: filter.field, alias });
    });
    if (whereClauses.length === 0) {
        return {
            sql: guard.sanitizedSql,
            params,
            appliedFilterCount: 0,
            appliedFilters,
            skippedFilters,
            projectedAliases,
        };
    }
    const { innerSql, limitClause } = splitTerminalLimit(guard.sanitizedSql);
    const limitSuffix = limitClause ? ` ${limitClause}` : '';
    return {
        sql: `SELECT * FROM (${innerSql}) AS report_chart WHERE ${whereClauses.join(' AND ')}${limitSuffix}`,
        params,
        appliedFilterCount: whereClauses.length,
        appliedFilters,
        skippedFilters,
        projectedAliases,
    };
}
function getDashboardFilterTargets() {
    return FILTER_TARGETS;
}
