import { useEffect, useMemo, useState } from 'react';
import { fetchDashboardSnapshot } from '../api/client';
import type { DashboardQueryResult } from '../api/types';
import { appConfig } from '../config';
import { DashboardApiError } from '../api/errors';

export type QueryState = {
  loading: boolean;
  result: DashboardQueryResult | null;
  error: DashboardApiError | null;
};

export function useDashboardOverview(token: string, role: string, mode: 'live' | 'fixture') {
  const [state, setState] = useState<QueryState>({ loading: false, result: null, error: null });

  useEffect(() => {
    if (!token && mode === 'live') {
      setState({
        loading: false,
        result: null,
        error: new DashboardApiError('Authentication required. Provide a token in settings.', 401, 'UNAUTHORIZED'),
      });
      return;
    }

    const controller = new AbortController();
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetchDashboardSnapshot({ token, role, mode, signal: controller.signal })
      .then((result) => {
        setState({ loading: false, result, error: null });
      })
      .catch((error: DashboardApiError) => {
        setState({ loading: false, result: null, error });
      });

    return () => controller.abort();
  }, [token, role, mode]);

  const staleMinutes = useMemo(() => {
    const generatedAt = state.result?.envelope?.data?.generatedAt;
    if (!generatedAt) return null;
    const delta = Date.now() - new Date(generatedAt).getTime();
    if (!Number.isFinite(delta) || delta < 0) return null;
    return Math.round(delta / 60000);
  }, [state.result]);

  const isStale = staleMinutes !== null && staleMinutes >= appConfig.staleAfterMinutes;

  return {
    ...state,
    staleMinutes,
    isStale,
  };
}
