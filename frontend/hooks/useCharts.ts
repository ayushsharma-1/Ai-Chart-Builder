'use client';

import { useCallback, useEffect, useState } from 'react';

import api from '@/lib/api';
import { ChartResult, ChartType, SavedChart } from '@/types';
import { useAccountId } from './useAccountId';

function normalizeChartConfig(result: ChartResult) {
  const yAxisList = Array.isArray(result.chartConfig.yAxis)
    ? result.chartConfig.yAxis.filter(Boolean)
    : [result.chartConfig.yAxis].filter(Boolean);
  const primaryYAxis = yAxisList[0] || '';
  const seriesKeys = result.chartConfig.seriesKeys?.length ? result.chartConfig.seriesKeys : yAxisList.slice(0, 1);

  return {
    ...result.chartConfig,
    yAxis: primaryYAxis,
    seriesKeys,
  };
}

export function useCharts() {
  const { accountId } = useAccountId();
  const [savedCharts, setSavedCharts] = useState<SavedChart[]>([]);

  const fetchCharts = useCallback(async () => {
    if (!accountId) {
      setSavedCharts([]);
      return;
    }

    const { data } = await api.get('/api/charts', { params: { accountId } });
    setSavedCharts(data.charts);
  }, [accountId]);

  useEffect(() => {
    fetchCharts().catch((error) => console.error('Failed to fetch charts:', error));
  }, [fetchCharts]);

  const saveChart = useCallback(async (result: ChartResult, overrideType?: ChartType, reportId?: string) => {
    if (!accountId) {
      throw new Error('Account ID is required to save a chart.');
    }

    const chartConfig = normalizeChartConfig(result);
    const payload = {
      title: result.title,
      prompt: result.prompt || result.title,
      sql: result.sql,
      reasoning: result.reasoning || '',
      aiExplanation: result.aiExplanation || '',
      queryConfidence: result.queryConfidence,
      metricLineage: result.metricLineage,
      chartType: overrideType || result.chartType,
      chartOverrideReason: result.chartOverrideReason || '',
      chartConfidence: result.chartConfidence,
      chartConfig,
      dataSnapshot: result.data,
      accountId,
      executionMetadata: result.executionMetadata || {
        rowCount: result.rowCount,
        queryDurationMs: result.executionTimeMs,
        lastRunAt: new Date().toISOString(),
        cacheStatus: 'miss',
      },
    };

    const { data } = await api.post('/api/charts', payload);

    if (reportId && data.chart?._id) {
      await api.post(`/api/reports/${reportId}/charts`, { chartId: data.chart._id });
    }

    await fetchCharts();
    return data.chart as SavedChart;
  }, [accountId, fetchCharts]);

  const deleteChart = useCallback(async (id: string) => {
    await api.delete(`/api/charts/${id}`, { params: { accountId } });
    setSavedCharts((previous) => previous.filter((chart) => chart._id !== id));
  }, [accountId]);

  const updatePosition = useCallback(async (id: string, gridPosition: SavedChart['gridPosition']) => {
    await api.patch(`/api/charts/${id}/position`, { gridPosition, accountId });
  }, [accountId]);

  return { savedCharts, saveChart, deleteChart, updatePosition, fetchCharts };
}
