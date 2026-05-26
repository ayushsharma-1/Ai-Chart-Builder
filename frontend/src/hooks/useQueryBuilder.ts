'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import api from '@/lib/api';
import { useAccountId } from '@/hooks/useAccountId';
import { QueryBuilderExecuteResult, QueryBuilderPreviewResult, QueryPlan, TransformPlan } from '@/src/types/queryBuilder';

const MAX_UNDO_STATES = 20;

function createInitialPlan(): QueryPlan {
  return {
    table: null,
    joins: [],
    columns: [],
    filters: [],
    groupBy: [],
    orderBy: [],
    limit: 1000,
  };
}

function createInitialTransform(): TransformPlan {
  return { filters: [], orderBy: [], limit: 1000 };
}

function clonePlan(plan: QueryPlan): QueryPlan {
  return {
    table: plan.table,
    joins: plan.joins.map((join) => ({ ...join })),
    columns: plan.columns.map((column) => ({ ...column })),
    filters: plan.filters.map((filter) => ({
      ...filter,
      value: Array.isArray(filter.value) ? [...filter.value] : filter.value,
    })),
    groupBy: [...plan.groupBy],
    orderBy: plan.orderBy.map((item) => ({ ...item })),
    limit: plan.limit,
  };
}

export function useQueryBuilder() {
  const { accountId } = useAccountId();
  const [plan, setPlanState] = useState<QueryPlan>(() => createInitialPlan());
  const [step, setStep] = useState(0);
  const [previewData, setPreviewData] = useState<Record<string, unknown>[]>([]);
  const [previewSql, setPreviewSql] = useState('');
  const [previewRowCount, setPreviewRowCount] = useState(0);
  const [previewExecutionTimeMs, setPreviewExecutionTimeMs] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [finalResult, setFinalResult] = useState<QueryBuilderExecuteResult | null>(null);
  const [finalLoading, setFinalLoading] = useState(false);
  const [finalError, setFinalError] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<QueryPlan[]>([]);

  // Derived / Transform state
  const [transformPlan, setTransformPlan] = useState<TransformPlan>(() => createInitialTransform());
  const [derivedResult, setDerivedResult] = useState<QueryBuilderExecuteResult | null>(null);
  const [derivedLoading, setDerivedLoading] = useState(false);
  const [derivedError, setDerivedError] = useState<string | null>(null);

  const previewRequestId = useRef(0);
  const finalRequestId = useRef(0);
  const derivedRequestId = useRef(0);

  const setPlan = useCallback((updater: QueryPlan | ((current: QueryPlan) => QueryPlan)) => {
    setPlanState((current) => {
      const nextPlan = typeof updater === 'function' ? (updater as (value: QueryPlan) => QueryPlan)(current) : updater;

      if (JSON.stringify(current) === JSON.stringify(nextPlan)) {
        return current;
      }

      setUndoStack((history) => [...history.slice(-(MAX_UNDO_STATES - 1)), clonePlan(current)]);
      setFinalResult(null);
      setFinalError(null);
      setDerivedResult(null);
      setDerivedError(null);
      return nextPlan;
    });
  }, []);

  const undo = useCallback(() => {
    setUndoStack((history) => {
      if (history.length === 0) {
        return history;
      }

      const previousPlan = history[history.length - 1];
      setPlanState(previousPlan);
      setFinalResult(null);
      setFinalError(null);
      setDerivedResult(null);
      return history.slice(0, -1);
    });
  }, []);

  const runPreview = useCallback(async () => {
    if (!accountId || !plan.table) {
      setPreviewData([]);
      setPreviewSql('');
      setPreviewRowCount(0);
      setPreviewExecutionTimeMs(0);
      setPreviewError(null);
      setPreviewLoading(false);
      return null;
    }

    const requestId = previewRequestId.current + 1;
    previewRequestId.current = requestId;
    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const { data } = await api.post<QueryBuilderPreviewResult>('/api/query-builder/preview', {
        plan,
        accountId: Number(accountId),
        previewLimit: 50,
      });

      if (previewRequestId.current !== requestId) {
        return data;
      }

      setPreviewData(data.data);
      setPreviewSql(data.sql);
      setPreviewRowCount(data.rowCount);
      setPreviewExecutionTimeMs(data.executionTimeMs);
      return data;
    } catch (error: any) {
      if (previewRequestId.current === requestId) {
        setPreviewError(error?.response?.data?.message || error?.message || 'Unable to load preview.');
        setPreviewData([]);
        setPreviewSql('');
        setPreviewRowCount(0);
        setPreviewExecutionTimeMs(0);
      }

      return null;
    } finally {
      if (previewRequestId.current === requestId) {
        setPreviewLoading(false);
      }
    }
  }, [accountId, plan]);

  const runFinal = useCallback(async () => {
    if (!accountId || !plan.table) {
      setFinalError('Select a table and at least one column before running the query.');
      return null;
    }

    const requestId = finalRequestId.current + 1;
    finalRequestId.current = requestId;
    setFinalLoading(true);
    setFinalError(null);

    try {
      const { data } = await api.post<QueryBuilderExecuteResult>('/api/query-builder/execute', {
        plan,
        accountId: Number(accountId),
        previewLimit: 5000,
      });

      if (finalRequestId.current !== requestId) {
        return data;
      }

      setFinalResult(data);
      setDerivedResult(null);
      return data;
    } catch (error: any) {
      if (finalRequestId.current === requestId) {
        setFinalError(error?.response?.data?.message || error?.message || 'Unable to execute query.');
      }

      return null;
    } finally {
      if (finalRequestId.current === requestId) {
        setFinalLoading(false);
      }
    }
  }, [accountId, plan]);

  const runDerived = useCallback(async (baseSql: string) => {
    if (!accountId || !baseSql) {
      setDerivedError('No base SQL available for transformation.');
      return null;
    }

    const requestId = derivedRequestId.current + 1;
    derivedRequestId.current = requestId;
    setDerivedLoading(true);
    setDerivedError(null);

    try {
      const { data } = await api.post<QueryBuilderExecuteResult>('/api/query-builder/derived', {
        parentSql: baseSql,
        transform: transformPlan,
        accountId: Number(accountId),
      });

      if (derivedRequestId.current !== requestId) return data;
      setDerivedResult(data);
      return data;
    } catch (error: any) {
      if (derivedRequestId.current === requestId) {
        setDerivedError(error?.response?.data?.message || error?.message || 'Unable to execute derived query.');
      }
      return null;
    } finally {
      if (derivedRequestId.current === requestId) {
        setDerivedLoading(false);
      }
    }
  }, [accountId, transformPlan]);

  useEffect(() => {
    if (!plan.table || !accountId) {
      setPreviewData([]);
      setPreviewSql('');
      setPreviewRowCount(0);
      setPreviewExecutionTimeMs(0);
      setPreviewError(null);
      return;
    }

    const timeout = globalThis.setTimeout(() => {
      void runPreview();
    }, 250);

    return () => globalThis.clearTimeout(timeout);
  }, [accountId, plan, runPreview]);

  return {
    plan,
    step,
    setStep,
    previewData,
    previewSql,
    previewRowCount,
    previewExecutionTimeMs,
    previewLoading,
    previewError,
    finalResult,
    finalLoading,
    finalError,
    undoStack,
    transformPlan,
    setTransformPlan,
    derivedResult,
    derivedLoading,
    derivedError,
    setPlan,
    undo,
    runPreview,
    runFinal,
    runDerived,
  };
}
