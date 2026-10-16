'use client';

import { useRouter } from 'next/navigation';
import React, { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../components/auth-provider';
import { FeedbackBanner } from '../../components/feedback-banner';
import { apiRequest } from '../../lib/auth-client';
import { resolveLoginDestination } from '../../lib/auth-navigation';
import { M1Icon } from '../../features/m1/icon';
import { PasswordField } from '../../components/password-field';
import { assertNewPasswordLength, NATIVE_PASSWORD_MIN_LENGTH } from '../../lib/native-password-policy';

type Mode = 'login' | 'register' | 'recover';

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user, loginWithPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [loginName, setLoginName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!isLoading && isAuthenticated && user) {
      void resolveLoginDestination(user, window.location.search, window.location.origin, async id => {
        await apiRequest(`/v2/projects/${encodeURIComponent(id)}/workspace`); return true;
      }).then(destination => { if (active) router.replace(destination); });
    }
    return () => { active = false; };
  }, [isAuthenticated, isLoading, user, router]);

  useEffect(() => { if (new URLSearchParams(window.location.search).get('mode') === 'register') setMode('register'); }, []);

  function switchMode(next: Mode) { setMode(next); setError(null); setNotice(null); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const username = String(data.get('username') ?? '');
    const password = String(data.get('password') ?? '');
    setBusy(true); setError(null); setNotice(null);
    try {
      if (mode !== 'login') assertNewPasswordLength(password);
      if (mode === 'register') {
        if (password !== data.get('confirmPassword')) throw new Error('两次密码不一致。');
        await apiRequest('/auth/register', { method: 'POST', body: { username, password, name: String(data.get('name') ?? '') } });
        // Account creation is durable even if the following login fails.
        setLoginName(username); setMode('login');
        setNotice('账号已创建。若未自动进入，请使用此工号登录，无需再次注册。');
        await loginWithPassword({ username, password });
        form.reset();
      } else if (mode === 'recover') {
        if (password !== data.get('confirmPassword')) throw new Error('两次密码不一致。');
        await apiRequest('/auth/recover', { method: 'POST', body: { token: String(data.get('token') ?? ''), newPassword: password } });
        form.reset(); setMode('login'); setNotice('密码已更新，旧会话已失效。请重新登录。');
      } else {
        await loginWithPassword({ username, password });
        form.reset(); // The authenticated-session effect resolves the destination once.
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : '操作失败，请重试。'); }
    finally { setBusy(false); }
  }

  return <section className="page-card auth-card native-auth-card m1-auth-card">
    <div className="m1-auth-emblem"><M1Icon name="project" size={24}/></div>
    <h1>{mode === 'login' ? '登录' : mode === 'register' ? '创建账号' : '重置密码'}</h1>

    {error && <FeedbackBanner variant="error" title="操作未成功" message={error} />}
    {notice && <FeedbackBanner variant="success" title="操作成功" message={notice} />}
    <form key={mode} onSubmit={event => void submit(event)} className="native-auth-form">
      {mode !== 'recover' && <label>工号<input name="username" type="text" defaultValue={loginName} placeholder="请输入工号" autoComplete="username" required minLength={3} maxLength={64} pattern={'[A-Za-z0-9][A-Za-z0-9._\\-]{2,63}'} disabled={busy} /></label>}
      {mode === 'register' && <label>姓名<input name="name" autoComplete="name" required maxLength={80} disabled={busy} /></label>}
      {mode === 'recover' && <label>一次性恢复码<input name="token" autoComplete="off" required minLength={43} maxLength={43} disabled={busy} /></label>}
      <PasswordField label={mode === 'recover' ? '新密码' : '密码'} name="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? 1 : NATIVE_PASSWORD_MIN_LENGTH} maxLength={256} disabled={busy} />
      {mode !== 'login' && <><PasswordField label="确认密码" name="confirmPassword" autoComplete="new-password" required minLength={NATIVE_PASSWORD_MIN_LENGTH} maxLength={256} disabled={busy} /></>}
      <button className="button button-primary" type="submit" disabled={busy || isLoading}>{busy ? '正在处理…' : mode === 'login' ? '登录' : mode === 'register' ? '注册并进入' : '更新密码'}</button>
    </form>
    <div className="native-auth-links">
      {mode !== 'login' && <button type="button" className="native-auth-link" disabled={busy} onClick={() => switchMode('login')}>返回登录</button>}
      {mode === 'login' && <><button type="button" className="native-auth-link" disabled={busy} onClick={() => switchMode('register')}>注册账号</button><button type="button" className="native-auth-link" disabled={busy} onClick={() => switchMode('recover')}>忘记密码</button></>}
    </div>
  </section>;
}
