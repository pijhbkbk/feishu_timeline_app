'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';

import { fetchAdminOverview, type AdminOverviewResponse } from '../lib/admin-client';
import { R22Kpi, R22StatusBadge } from './r22-ui';

export function AdminDashboardR22() {
  const [data, setData] = useState<AdminOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      setData(await fetchAdminOverview());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '后台总览加载失败。');
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading && !data) return <div className="r22-card r22-skeleton-card" aria-label="正在加载后台总览" />;

  return (
    <div className="r22-page r22-admin-page" data-testid="admin-page">
      <div className="r22-admin-toolbar">
        <button
          type="button"
          className="r22-button r22-button-secondary"
          disabled={isLoading}
          onClick={() => void load()}
        >
          刷新数据
        </button>
      </div>
      {error ? <div className="r22-inline-alert"><span>{error}</span><button type="button" onClick={() => void load()}>重新加载</button></div> : null}
      {data ? <>
        <section className="r22-kpi-grid"><R22Kpi label="启用用户" value={data.summary.activeUsers} hint="当前可登录系统" tone="brand" /><R22Kpi label="启用部门" value={data.summary.activeDepartments} hint="有效组织单元" tone="neutral" /><R22Kpi label="启用角色" value={data.summary.activeRoles} hint="当前权限角色" tone="monthly" /><R22Kpi label="异常动作" value={data.summary.anomalyCount} hint="近 30 天需关注" tone={data.summary.anomalyCount > 0 ? 'danger' : 'success'} /></section>
        <section className="r22-admin-module-grid">{data.modules.map((module) => <Link href={module.href} className="r22-card r22-admin-module-card" key={module.key}><span className="r22-admin-module-icon" aria-hidden="true">{getModuleIcon(module.key)}</span><div><h2>{module.title}</h2><p>{module.description}</p></div><strong>{module.metric}</strong><span className="r22-text-link">进入管理 →</span></Link>)}</section>
        <section className="r22-card r22-admin-anomalies"><div className="r22-section-heading"><div><p className="r22-overline">审计焦点</p><h2>近期异常与敏感动作</h2><p>只展示真实审计日志中的失败、拒绝、删除和锁定事件。</p></div><R22StatusBadge tone={data.summary.anomalyCount > 0 ? 'warning' : 'success'}>{data.summary.anomalyCount > 0 ? '需要检查' : '运行正常'}</R22StatusBadge></div>{data.anomalies.length ? <div className="r22-activity-list">{data.anomalies.map((item) => <article key={item.id}><span className="r22-activity-dot" /><div><strong>{item.summary}</strong><p>{item.actorName} · 已记录</p></div><time>{new Date(item.createdAt).toLocaleString('zh-CN')}</time></article>)}</div> : <div className="r22-empty-compact"><strong>近 30 天没有异常动作</strong><p>审计日志仍会持续记录关键写操作。</p></div>}</section>
      </> : null}
    </div>
  );
}

function getModuleIcon(key: string) {
  if (key === 'projects') return '项';
  if (key === 'tasks') return '序';
  if (key === 'organization') return '组';
  if (key === 'assignments') return '责';
  if (key === 'permissions') return '权';
  return '审';
}
