'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '../../components/auth-provider';
import { FeedbackBanner } from '../../components/feedback-banner';

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, feishuEnabled, startFeishuLogin } = useAuth();
  const hasStartedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || hasStartedRef.current) {
      return;
    }

    if (isAuthenticated) {
      hasStartedRef.current = true;
      router.replace('/dashboard');
      return;
    }

    if (!feishuEnabled) {
      setError('飞书登录未配置，请联系系统管理员。');
      return;
    }

    hasStartedRef.current = true;
    setError(null);

    void startFeishuLogin().catch((loginError: unknown) => {
      setError(loginError instanceof Error ? loginError.message : '飞书登录不可用。');
    });
  }, [feishuEnabled, isAuthenticated, isLoading, router, startFeishuLogin]);

  return (
    <section className="page-card auth-card auth-redirect-card" aria-live="polite">
      {error ? (
        <FeedbackBanner variant="error" title="无法打开飞书登录" message={error} />
      ) : (
        <p className="muted">正在打开飞书登录…</p>
      )}
    </section>
  );
}
