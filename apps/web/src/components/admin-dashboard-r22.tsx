'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';

import { fetchAdminOverview, type AdminOverviewResponse } from '../lib/admin-client';

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
      setError(loadError instanceof Error ? loadError.message : '系统概况加载失败。');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="r26-admin-home" data-testid="admin-page">
      <header className="r26-admin-home__header">
        <div>
          <h1>系统管理</h1>
          <p>查看系统规模、项目运行状态和颜色资料归档情况</p>
          {data ? <time dateTime={data.generatedAt}>数据更新于 {formatUpdatedAt(data.generatedAt)}</time> : null}
        </div>
        <button type="button" className="r26-admin-home__refresh" onClick={() => void load()} disabled={isLoading}>
          {isLoading ? '刷新中…' : '刷新数据'}
        </button>
      </header>

      {error ? (
        <div className="r26-admin-home__error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void load()}>重新加载</button>
        </div>
      ) : null}

      {isLoading && !data ? <AdminOverviewSkeleton /> : null}

      {data ? (
        <>
          <section className="r26-admin-metrics" aria-label="系统主要数据">
            <Metric label="项目总数" value={data.summary.totalProjects} hint="全部项目" />
            <Metric label="进行中项目" value={data.summary.activeProjects} hint="尚未完成" />
            <Metric label="风险项目" value={data.summary.riskProjects} hint="逾期、阻塞或评审超时" tone="risk" />
            <Metric label="启用人员" value={data.summary.activeUsers} hint="可登录和参与项目" />
            <Metric label="启用部门" value={data.summary.activeDepartments} hint="有效组织单元" />
            <Metric label="已归档颜色" value={data.summary.archivedColors} hint={`共 ${data.summary.totalMaterials} 份材料`} tone="archive" />
          </section>

          <section className="r26-admin-entry-grid" aria-label="系统管理入口">
            <Link href="/admin/manage" className="r26-admin-entry r26-admin-entry--manage">
              <div>
                <h2>进入管理</h2>
                <p>管理项目、工序、人员、部门、分工权限、流程模板和系统参数。</p>
              </div>
              <strong>进入管理 <span aria-hidden="true">→</span></strong>
            </Link>
            <Link href="/admin/color-database" className="r26-admin-entry r26-admin-entry--color">
              <div>
                <h2>颜色数据库</h2>
                <p>按颜色、车型、项目和工序，集中归档开发资料、评审报告和量产记录。</p>
              </div>
              <strong>打开数据库 <span aria-hidden="true">→</span></strong>
            </Link>
          </section>
        </>
      ) : null}
    </main>
  );
}

function Metric({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: number;
  hint: string;
  tone?: 'default' | 'risk' | 'archive';
}) {
  return (
    <article className={`r26-admin-metric r26-admin-metric--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function AdminOverviewSkeleton() {
  return (
    <div className="r26-admin-home__skeleton" aria-label="正在加载系统概况">
      {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
    </div>
  );
}

function formatUpdatedAt(value: string) {
  const timestamp = new Date(value).getTime();
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}
