'use client';

import { useCallback, useEffect, useState } from 'react';

import api from '@/lib/api';
import { ChartResult, ChartType, SavedChart } from '@/types';

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
  const [savedCharts, setSavedCharts] = useState<SavedChart[]>([]);

  const fetchCharts = useCallback(async () => {
    const { data } = await api.get('/api/charts');
    setSavedCharts(data.charts);
  }, []);

  useEffect(() => {
    fetchCharts().catch((error) => console.error('Failed to fetch charts:', error));
  }, [fetchCharts]);

  const saveChart = useCallback(async (result: ChartResult, overrideType?: ChartType, reportId?: string) => {
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
  }, [fetchCharts]);

  const deleteChart = useCallback(async (id: string) => {
    await api.delete(`/api/charts/${id}`);
    setSavedCharts((previous) => previous.filter((chart) => chart._id !== id));
  }, []);

  const updatePosition = useCallback(async (id: string, gridPosition: SavedChart['gridPosition']) => {
    await api.patch(`/api/charts/${id}/position`, { gridPosition });
  }, []);

  return { savedCharts, saveChart, deleteChart, updatePosition, fetchCharts };
}
