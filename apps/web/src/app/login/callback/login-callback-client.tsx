'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '../../../components/auth-provider';

export function LoginCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { completeFeishuLogin } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const hasHandledRef = useRef(false);

  useEffect(() => {
    if (hasHandledRef.current) {
      return;
    }

    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code) {
      setError('缺少飞书登录回调参数 code。');
      return;
    }

    hasHandledRef.current = true;
    void completeFeishuLogin({ code, state })
      .then(() => {
        router.replace('/projects');
      })
      .catch((callbackError) => {
        setError(
          callbackError instanceof Error ? callbackError.message : '飞书登录回调处理失败。',
        );
      });
  }, [completeFeishuLogin, router, searchParams]);

  if (error) {
    return (
      <section className="page-card">
        <p className="eyebrow">Login Callback</p>
        <h1>飞书登录未完成</h1>
        <p>{error}</p>
        <div className="page-actions">
          <Link href="/login" className="button button-primary">
            返回登录
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="page-card">
      <p className="eyebrow">Login Callback</p>
      <h1>正在建立系统会话</h1>
      <p>系统正在处理飞书回调并写入本系统会话，请稍候。</p>
    </section>
  );
}
