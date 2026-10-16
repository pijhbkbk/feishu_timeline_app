'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../components/auth-provider';
import { needsAssignment } from '../../lib/auth-navigation';

export default function PendingAccessPage() {
  const { user, refreshSession } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (user && !needsAssignment(user)) router.replace('/dashboard'); }, [user, router]);
  if (!user || !needsAssignment(user)) return null;
  async function refresh() {
    setBusy(true); setError('');
    try { await refreshSession(); } catch { setError('暂时无法刷新授权状态，请稍后重试。'); } finally { setBusy(false); }
  }
  return <section className="page-card native-account-card">
    <h1>等待准入确认</h1>
    <p>{user.name} · 工号：{user.username}</p>
    <p>账号尚未获准使用团队业务。</p>
    {error ? <p role="alert">{error}</p> : null}
    <div className="page-actions"><button className="button button-primary" disabled={busy} onClick={() => void refresh()}>{busy ? '正在刷新…' : '刷新授权状态'}</button><Link href="/account">我的资料</Link></div>
  </section>;
}
