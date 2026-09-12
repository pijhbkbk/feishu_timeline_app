'use client';
import Link from 'next/link';
import React, { useState, type FormEvent } from 'react';
import { useAuth } from '../../components/auth-provider';
import { apiRequest } from '../../lib/auth-client';
import { FeedbackBanner } from '../../components/feedback-banner';

export default function AccountPage() {
  const { user, refreshSession, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  if (!user) return null;
  async function choose(job: 'purchaser' | 'process_engineer') {
    setBusy(true); setError(null);
    try { await apiRequest('/auth/job', { method: 'POST', body: { job } }); await refreshSession(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '岗位提交失败。'); }
    finally { setBusy(false); }
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    setBusy(true); setError(null);
    try {
      if (data.get('newPassword') !== data.get('confirmation')) throw new Error('两次密码不一致。');
      await apiRequest('/auth/password', { method: 'POST', body: { currentPassword: String(data.get('currentPassword')), newPassword: String(data.get('newPassword')) } });
      form.reset(); setNotice('密码已更新，请重新登录。'); await logout(); window.location.assign('/login');
    } catch (failure) { setError(failure instanceof Error ? failure.message : '密码更新失败。'); }
    finally { setBusy(false); }
  }
  return <section className="page-card native-account-card">
    <h1>{user.onboardingCompleted === false ? '选择你的岗位' : '我的账号'}</h1>
    <p>{user.name} · {user.username}</p>
    {error && <FeedbackBanner variant="error" title="操作未成功" message={error} />}
    {notice && <FeedbackBanner variant="success" title="操作成功" message={notice} />}
    {user.onboardingCompleted === false ? <><p>选择岗位后，管理员将确认你的职责并分配项目。</p><div className="page-actions"><button className="button button-primary" disabled={busy} onClick={() => void choose('purchaser')}>采购人员</button><button className="button button-primary" disabled={busy} onClick={() => void choose('process_engineer')}>工艺人员</button></div></> : !user.roleCodes.length ? <FeedbackBanner variant="info" title={user.requestedJob === 'purchaser' ? '采购工作台' : user.requestedJob === 'process_engineer' ? '工艺工作台' : '等待账号授权'} message="岗位申请已提交，尚未分配项目。请联系管理员确认岗位与项目范围。" /> : <Link href="/dashboard" className="button button-primary">进入工作台</Link>}
    {user.isSystemAdmin && <div className="page-actions"><Link href="/admin/accounts" className="button">管理账号</Link><Link href="/admin/organization" className="button">人员、岗位与项目授权</Link></div>}
    <h2>修改密码</h2>
    <form className="native-auth-form" onSubmit={event => void changePassword(event)}>
      <label>当前密码<input type="password" name="currentPassword" autoComplete="current-password" required maxLength={256} disabled={busy} /></label>
      <label>新密码<input type="password" name="newPassword" autoComplete="new-password" minLength={15} maxLength={256} required disabled={busy} /></label>
      <label>确认新密码<input type="password" name="confirmation" autoComplete="new-password" minLength={15} maxLength={256} required disabled={busy} /></label>
      <p className="muted">使用 15–128 个字符。修改后所有旧会话都将失效。</p>
      <button type="submit" className="button button-primary" disabled={busy}>更新密码</button>
    </form>
  </section>;
}
