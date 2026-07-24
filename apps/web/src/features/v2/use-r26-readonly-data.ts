'use client';

import { useEffect, useState } from 'react';

import { r26ReadOnlyGet } from './r26-readonly-client';

export function useR26ReadOnlyData<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    if (!path) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    setLoading(true);
    setError(null);

    r26ReadOnlyGet<T>(path, { signal: controller.signal })
      .then((response) => setData(response))
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
  }, [path, refreshVersion]);

  return {
    data,
    error,
    loading,
    refresh: () => setRefreshVersion((version) => version + 1),
  };
}
