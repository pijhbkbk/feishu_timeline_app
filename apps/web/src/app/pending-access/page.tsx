'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../components/auth-provider';
import { FeedbackBanner } from '../../components/feedback-banner';
import { apiRequest } from '../../lib/auth-client';
import { needsAssignment } from '../../lib/auth-navigation';

export default function PendingAccessPage() {
  const { user, refreshSession } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (user && !needsAssignment(user)) router.replace('/dashboard'); }, [user, router]);
  if (!user || !needsAssignment(user)) return null;
  async function choose(job: 'purchaser' | 'process_engineer') {
    setBusy(true); setError(null);
    try { await apiRequest('/auth/job', { method: 'POST', body: { job } }); await refreshSession(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '岗位提交失败。'); }
    finally { setBusy(false); }
  }
  return <section className="page-card native-account-card">
    <p className="eyebrow">工作台</p><h1>等待工作分配</h1>
    <p>{user.name} · 工号：{user.username}</p>
    <p>账号已就绪。正式岗位和项目范围由管理员分配，申请岗位不会自动获得权限。</p>
    {error && <FeedbackBanner variant="error" title="操作未成功" message={error} />}
    {user.onboardingCompleted === false ? <><h2>提交岗位意向</h2><div className="page-actions"><button className="button button-primary" disabled={busy} onClick={() => void choose('purchaser')}>采购人员</button><button className="button button-primary" disabled={busy} onClick={() => void choose('process_engineer')}>工艺人员</button></div></> : <p role="status">已提交{user.requestedJob === 'purchaser' ? '采购' : user.requestedJob === 'process_engineer' ? '工艺' : ''}岗位意向，请等待管理员确认。</p>}
    <div className="page-actions"><button className="button" disabled={busy} onClick={() => void refreshSession()}>刷新授权状态</button><Link href="/account">我的账号</Link></div>
  </section>;
}
