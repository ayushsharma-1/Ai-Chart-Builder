'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import api from '@/lib/api';
import { Report, ReportRefreshResult, SavedChart } from '@/types';

const ACCOUNT_ID_STORAGE_KEY = 'lens_account_id';

function readStoredAccountId(): string | null {
  if (globalThis.window === undefined) {
    return null;
  }

  const stored = globalThis.window.localStorage.getItem(ACCOUNT_ID_STORAGE_KEY);
  return stored && /^\d+$/.test(stored) ? stored : null;
}

export function useReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchReports = useCallback(async () => {
    setIsLoading(true);

    try {
      const { data } = await api.get('/api/reports');
      setReports(data.reports || []);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports().catch((error) => console.error('Failed to fetch reports:', error));
  }, [fetchReports]);

  const createReport = useCallback(async (payload: { title: string; description?: string }) => {
    const { data } = await api.post('/api/reports', payload);
    await fetchReports();
    return data.report as Report;
  }, [fetchReports]);

  const duplicateReport = useCallback(async (id: string) => {
    const { data } = await api.post(`/api/reports/${id}/duplicate`);
    await fetchReports();
    return data.report as Report;
  }, [fetchReports]);

  const deleteReport = useCallback(async (id: string) => {
    await api.delete(`/api/reports/${id}`);
    setReports((previous) => previous.filter((report) => report._id !== id));
  }, []);

  return { reports, isLoading, fetchReports, createReport, duplicateReport, deleteReport };
}

export function useReport(reportId?: string, options: { mode?: 'view' | 'edit'; shareToken?: string } = {}) {
  const [report, setReport] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(reportId));
  const [error, setError] = useState<string | null>(null);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();

    if (options.shareToken) {
      params.set('shareToken', options.shareToken);
    }

    if (options.mode === 'edit') {
      params.set('mode', 'edit');
    }

    const query = params.toString();
    return query ? `?${query}` : '';
  }, [options.mode, options.shareToken]);

  const fetchReport = useCallback(async () => {
    if (!reportId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data } = await api.get(`/api/reports/${reportId}${queryParams}`);
      setReport(data.report);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Unable to load report.');
    } finally {
      setIsLoading(false);
    }
  }, [queryParams, reportId]);

  useEffect(() => {
    fetchReport().catch((requestError) => {
      console.error('Failed to fetch report:', requestError);
      setError('Unable to load report.');
    });
  }, [fetchReport]);

  const updateReport = useCallback(async (payload: Partial<Report>) => {
    if (!reportId) return null;
    const { data } = await api.patch(`/api/reports/${reportId}`, payload);
    setReport(data.report);
    return data.report as Report;
  }, [reportId]);

  const addChart = useCallback(async (chartId: string) => {
    if (!reportId) return null;
    const { data } = await api.post(`/api/reports/${reportId}/charts`, { chartId });
    setReport(data.report);
    return data.report as Report;
  }, [reportId]);

  const removeChart = useCallback(async (chartId: string) => {
    if (!reportId) return null;
    const { data } = await api.delete(`/api/reports/${reportId}/charts/${chartId}`);
    setReport(data.report);
    return data.report as Report;
  }, [reportId]);

  const updateChartLayout = useCallback(async (chartId: string, layout: SavedChart['gridPosition']) => {
    if (!reportId) return null;
    const { data } = await api.patch(`/api/reports/${reportId}/charts/${chartId}/layout`, { layout });
    setReport(data.report);
    return data.report as Report;
  }, [reportId]);

  const updateLayout = useCallback(async (layout: Array<{ chartId: string; gridPosition: SavedChart['gridPosition'] }>) => {
    if (!reportId) return null;
    const { data } = await api.patch(`/api/reports/${reportId}/layout`, { layout });
    setReport(data.report);
    return data.report as Report;
  }, [reportId]);

  const refresh = useCallback(async (options: { persistSnapshots?: boolean } = {}) => {
    if (!reportId) return null;
    const accountId = readStoredAccountId();
    if (!accountId) return null;

    const { data } = await api.post(`/api/reports/${reportId}/refresh`, {
      persistSnapshots: options.persistSnapshots,
      accountId,
    });
    setReport(data.report);
    return data as { success: boolean; report: Report; results: ReportRefreshResult[] };
  }, [reportId]);

  const generateInsights = useCallback(async () => {
    if (!reportId) return null;
    const { data } = await api.post(`/api/reports/${reportId}/insights`);
    setReport(data.report);
    return data.report as Report;
  }, [reportId]);

  const share = useCallback(async (enabled = true) => {
    if (!reportId) return null;
    const { data } = await api.post(`/api/reports/${reportId}/share`, { enabled });
    setReport(data.report);
    return data.report as Report;
  }, [reportId]);

  const addComment = useCallback(async (body: string, chartId?: string) => {
    if (!reportId) return null;
    const { data } = await api.post(`/api/reports/${reportId}/comments`, { body, chartId });
    setReport(data.report);
    return data.report as Report;
  }, [reportId]);

  return {
    report,
    setReport,
    isLoading,
    error,
    fetchReport,
    updateReport,
    addChart,
    removeChart,
    updateChartLayout,
    updateLayout,
    refresh,
    generateInsights,
    share,
    addComment,
  };
}
