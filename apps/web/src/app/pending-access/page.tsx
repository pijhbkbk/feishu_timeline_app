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
    <p className="eyebrow">人员已入库</p><h1>等待管理员分配角色</h1>
    <p>{user.name} · 工号：{user.username}</p>
    <p>注册已完成。管理员在人员表为你分配角色后，系统会显示可以处理的工作，无需再次提交申请。</p>
    {error ? <p role="alert">{error}</p> : null}
    <div className="page-actions"><button className="button button-primary" disabled={busy} onClick={() => void refresh()}>{busy ? '正在刷新…' : '刷新授权状态'}</button><Link href="/account">我的资料</Link></div>
  </section>;
}
