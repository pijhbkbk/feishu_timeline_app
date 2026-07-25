'use client';

import { useRouter } from 'next/navigation';
import React from 'react';
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '../../components/auth-provider';
import { FeedbackBanner } from '../../components/feedback-banner';
import { isLogoutLanding } from './login-page-state';

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, feishuEnabled, startFeishuLogin } = useAuth();
  const hasStartedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedOut, setIsLoggedOut] = useState(false);

  useEffect(() => {
    if (hasStartedRef.current) {
      return;
    }

    if (isLogoutLanding(window.location.search)) {
      hasStartedRef.current = true;
      setIsLoggedOut(true);
      return;
    }

    if (isLoading) {
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

  function handleLoginAgain() {
    setError(null);
    setIsLoggedOut(false);
    void startFeishuLogin().catch((loginError: unknown) => {
      setError(loginError instanceof Error ? loginError.message : '飞书登录不可用。');
    });
  }

  return (
    <section className="page-card auth-card auth-redirect-card" aria-live="polite">
      {isLoggedOut ? (
        <>
          <FeedbackBanner
            variant="success"
            title="已退出登录"
            message="当前系统会话已经安全结束。需要继续使用时，请重新登录。"
          />
          <div className="page-actions">
            <button type="button" className="button button-primary" onClick={handleLoginAgain}>
              重新登录
            </button>
          </div>
        </>
      ) : error ? (
        <FeedbackBanner variant="error" title="无法打开飞书登录" message={error} />
      ) : (
        <p className="muted">正在打开飞书登录…</p>
      )}
    </section>
  );
}
