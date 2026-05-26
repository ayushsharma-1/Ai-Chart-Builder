export type AggregateFunction = 'none' | 'COUNT' | 'SUM' | 'AVG' | 'MAX' | 'MIN';

export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';

export interface QueryPlan {
  table: string | null;
  joins: JoinStep[];
  columns: ColumnStep[];
  filters: FilterStep[];
  groupBy: string[];
  orderBy: OrderByStep[];
  limit: number;
}

export interface JoinStep {
  table: string;
  leftCol: string;
  rightCol: string;
  joinType: JoinType;
  custom?: boolean;
}

export interface ColumnStep {
  table: string;
  column: string;
  alias: string;
  aggregate: AggregateFunction;
}

export interface FilterStep {
  table: string;
  column: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN';
  value: string | number | boolean | Array<string | number | boolean>;
}

export interface OrderByStep {
  alias: string;
  direction: 'ASC' | 'DESC';
}

export interface QueryBuilderPreviewResult {
  data: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
  sql: string;
}

export interface QueryBuilderExecuteResult extends QueryBuilderPreviewResult {
  chartConfig: {
    xAxis: string;
    yAxis: string;
    seriesKeys: string[];
  };
}
