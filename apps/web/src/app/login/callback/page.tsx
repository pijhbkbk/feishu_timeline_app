import { Suspense } from 'react';

import { LoginCallbackClient } from './login-callback-client';

function LoginCallbackFallback() {
  return (
    <section className="page-card">
      <p className="eyebrow">Login Callback</p>
      <h1>正在准备回调上下文</h1>
      <p>页面正在读取飞书回调参数。</p>
    </section>
  );
}

export default function LoginCallbackPage() {
  return (
    <Suspense fallback={<LoginCallbackFallback />}>
      <LoginCallbackClient />
    </Suspense>
  );
}
