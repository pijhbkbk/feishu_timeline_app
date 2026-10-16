'use client';
import Link from 'next/link';
import React, { useState, type FormEvent } from 'react';
import { useAuth } from '../../../components/auth-provider';
import { PasswordField } from '../../../components/password-field';
import { FeedbackBanner } from '../../../components/feedback-banner';
import { apiRequest } from '../../../lib/auth-client';
import { assertNewPasswordLength, NATIVE_PASSWORD_HELP, NATIVE_PASSWORD_MIN_LENGTH } from '../../../lib/native-password-policy';

export default function AccountSecurityPage() {
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    setBusy(true); setError(null);
    try {
      assertNewPasswordLength(String(data.get('newPassword') ?? ''));
      if (data.get('newPassword') !== data.get('confirmation')) throw new Error('两次密码不一致。');
      await apiRequest('/auth/password', { method: 'POST', body: { currentPassword: String(data.get('currentPassword')), newPassword: String(data.get('newPassword')) } });
      form.reset(); await logout(); window.location.assign('/login?passwordChanged=1');
    } catch (failure) { setError(failure instanceof Error ? failure.message : '密码更新失败。'); }
    finally { setBusy(false); }
  }
  return <section className="page-card native-security-card">
    <Link href="/account">返回我的账号</Link><h1>账号安全</h1>
    <p className="muted">工号：{user.username}</p><h2>修改密码</h2>
    {error && <FeedbackBanner variant="error" title="操作未成功" message={error} />}
    <form className="native-auth-form" onSubmit={event => void changePassword(event)}>
      <input type="text" name="username" autoComplete="username" value={user.username} readOnly hidden />
      <PasswordField label="当前密码" name="currentPassword" autoComplete="current-password" required maxLength={256} disabled={busy} />
      <PasswordField label="新密码" name="newPassword" autoComplete="new-password" minLength={NATIVE_PASSWORD_MIN_LENGTH} maxLength={256} required disabled={busy} />
      <PasswordField label="确认新密码" name="confirmation" autoComplete="new-password" minLength={NATIVE_PASSWORD_MIN_LENGTH} maxLength={256} required disabled={busy} />
      <p className="muted">{NATIVE_PASSWORD_HELP} 修改后所有旧会话都将失效，请重新登录。</p>
      <button type="submit" className="button button-primary" disabled={busy}>{busy ? '正在更新…' : '更新密码'}</button>
    </form>
  </section>;
}
