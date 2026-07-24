'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { isR26ReadOnlyRealDataEnabled } from './r26-data-mode';
import { r26ReadOnlyGet } from './r26-readonly-client';
import type { R26DashboardResponse, R26Viewer } from './real-types';

type R26RealDataContextValue = {
  enabled: boolean;
  dashboardResponse: R26DashboardResponse | null;
  viewer: R26Viewer | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const R26RealDataContext = createContext<R26RealDataContextValue>({
  enabled: false,
  dashboardResponse: null,
  viewer: null,
  loading: false,
  error: null,
  refresh: () => undefined,
});

export function R26RealDataProvider({ children }: PropsWithChildren) {
  const enabled = isR26ReadOnlyRealDataEnabled();
  const [dashboardResponse, setDashboardResponse] =
    useState<R26DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);

    r26ReadOnlyGet<R26DashboardResponse>('/v2/dashboard', {
      signal: controller.signal,
    })
      .then((response) => {
        setDashboardResponse(response);
        setError(null);
      })
      .catch((requestError: unknown) => {
        setError(
          requestError instanceof DOMException && requestError.name === 'AbortError'
            ? '真实数据读取超时，请检查 staging 服务后重试。'
            : requestError instanceof Error
              ? requestError.message
              : '真实数据读取失败。',
        );
      })
      .finally(() => {
        window.clearTimeout(timeout);
        setLoading(false);
      });

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [enabled, refreshVersion]);

  useEffect(() => {
    const refresh = () => setRefreshVersion((version) => version + 1);
    window.addEventListener('r26:data-changed', refresh);
    return () => window.removeEventListener('r26:data-changed', refresh);
  }, []);

  const value = useMemo(
    () => ({
      enabled,
      dashboardResponse,
      viewer: dashboardResponse?.viewer ?? null,
      loading,
      error,
      refresh: () => setRefreshVersion((version) => version + 1),
    }),
    [dashboardResponse, enabled, error, loading],
  );

  return (
    <R26RealDataContext.Provider value={value}>
      {children}
    </R26RealDataContext.Provider>
  );
}

export function useR26RealData() {
  return useContext(R26RealDataContext);
}
