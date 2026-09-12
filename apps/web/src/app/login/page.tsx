'use client';

import { useRouter } from 'next/navigation';
import React, { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../components/auth-provider';
import { FeedbackBanner } from '../../components/feedback-banner';
import { apiRequest } from '../../lib/auth-client';

type Mode = 'login' | 'register' | 'recover';

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user, loginWithPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace(user?.onboardingCompleted === false || !user?.roleCodes.length ? '/account' : '/dashboard');
  }, [isAuthenticated, isLoading, user, router]);

  function switchMode(next: Mode) { setMode(next); setError(null); setNotice(null); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const username = String(data.get('username') ?? '');
    const password = String(data.get('password') ?? '');
    setBusy(true); setError(null); setNotice(null);
    try {
      if (mode === 'register') {
        if (password !== data.get('confirmPassword')) throw new Error('两次密码不一致。');
        await apiRequest('/auth/register', { method: 'POST', body: { username, password, name: String(data.get('name') ?? '') } });
        form.reset(); setMode('login'); setNotice('账号已创建，请使用用户名和密码登录。');
      } else if (mode === 'recover') {
        if (password !== data.get('confirmPassword')) throw new Error('两次密码不一致。');
        await apiRequest('/auth/recover', { method: 'POST', body: { token: String(data.get('token') ?? ''), newPassword: password } });
        form.reset(); setMode('login'); setNotice('密码已更新，旧会话已失效。请重新登录。');
      } else {
        const account = await loginWithPassword({ username, password });
        form.reset(); router.replace(account.onboardingCompleted === false || !account.roleCodes.length ? '/account' : '/dashboard');
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : '操作失败，请重试。'); }
    finally { setBusy(false); }
  }

  return <section className="page-card auth-card native-auth-card">
    <p className="eyebrow">轻卡新颜色开发项目管理系统</p>
    <h1>{mode === 'login' ? '登录系统' : mode === 'register' ? '创建账号' : '重置密码'}</h1>
    <p className="muted">{mode === 'recover' ? '请向系统管理员核验身份并获取一次性恢复码。' : '使用本系统账号，无需第三方登录。'}</p>
    {error && <FeedbackBanner variant="error" title="操作未成功" message={error} />}
    {notice && <FeedbackBanner variant="success" title="操作成功" message={notice} />}
    <form key={mode} onSubmit={event => void submit(event)} className="native-auth-form">
      {mode !== 'recover' && <label>用户名<input name="username" autoComplete="username" required minLength={3} maxLength={64} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,63}" disabled={busy} /><span className="muted">3–64 位字母、数字、点、下划线或连字符</span></label>}
      {mode === 'register' && <label>姓名<input name="name" autoComplete="name" required maxLength={80} disabled={busy} /></label>}
      {mode === 'recover' && <label>一次性恢复码<input name="token" autoComplete="off" required minLength={43} maxLength={43} disabled={busy} /></label>}
      <label>{mode === 'recover' ? '新密码' : '密码'}<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? 1 : 15} maxLength={256} disabled={busy} /></label>
      {mode !== 'login' && <><p className="muted">15–128 个字符，可使用空格和较长口令。</p><label>确认密码<input name="confirmPassword" type="password" autoComplete="new-password" required maxLength={256} disabled={busy} /></label></>}
      <button className="button button-primary" type="submit" disabled={busy || isLoading}>{busy ? '正在处理…' : mode === 'login' ? '登录' : mode === 'register' ? '创建账号' : '更新密码'}</button>
    </form>
    <div className="page-actions">
      {mode !== 'login' && <button type="button" className="button" disabled={busy} onClick={() => switchMode('login')}>返回登录</button>}
      {mode === 'login' && <><button type="button" className="button" onClick={() => switchMode('register')}>注册账号</button><button type="button" className="button" onClick={() => switchMode('recover')}>忘记密码</button></>}
    </div>
  </section>;
}
