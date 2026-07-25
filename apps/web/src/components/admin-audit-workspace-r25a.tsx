'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import {
  fetchAdminAuditLogDetail,
  fetchAdminAuditLogs,
  type AdminAuditDetailResponse,
  type AdminAuditListResponse,
  type AdminAuditQuery,
} from '../lib/admin-client';
import { AdminControlNavigation } from './admin-control-center';
import { R22Kpi, R22StatusBadge } from './r22-ui';

const ENTITY_OPTIONS = [
  'PROJECT',
  'COLOR',
  'COLOR_EXIT',
  'WORKFLOW_TASK',
  'REVIEW_RECORD',
  'DEVELOPMENT_FEE',
  'ATTACHMENT',
  'USER',
  'ROLE',
  'SYSTEM',
];

type AuditFilterForm = {
  from: string;
  to: string;
  actorName: string;
  action: string;
  projectId: string;
  result: string;
  keyword: string;
  entityType: string;
  entityId: string;
  requestId: string;
};

const EMPTY_FILTERS: AuditFilterForm = {
  from: '',
  to: '',
  actorName: '',
  action: '',
  projectId: '',
  result: '',
  keyword: '',
  entityType: '',
  entityId: '',
  requestId: '',
};

export function AdminAuditWorkspaceR25A() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialState = useMemo(() => readQueryState(searchParams), [searchParams]);
  const [filters, setFilters] = useState<AuditFilterForm>(initialState.filters);
  const [query, setQuery] = useState<AdminAuditQuery>(initialState.query);
  const [data, setData] = useState<AdminAuditListResponse | null>(null);
  const [detail, setDetail] = useState<AdminAuditDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const load = useCallback(async (nextQuery: AdminAuditQuery) => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await fetchAdminAuditLogs(nextQuery));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '审计日志加载失败。');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(query);
  }, [load, query]);

  function commitQuery(nextQuery: AdminAuditQuery) {
    setQuery(nextQuery);
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(nextQuery)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    router.replace(`/admin/audit-logs${params.size ? `?${params.toString()}` : ''}`, {
      scroll: false,
    });
  }

  function applyFilters() {
    commitQuery({
      ...filtersToQuery(filters),
      page: 1,
      pageSize: query.pageSize ?? 25,
      sort: query.sort ?? 'createdAt:desc',
    });
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    commitQuery({ page: 1, pageSize: query.pageSize ?? 25, sort: 'createdAt:desc' });
  }

  async function openDetail(auditLogId: string) {
    setIsDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    try {
      setDetail(await fetchAdminAuditLogDetail(auditLogId));
    } catch (loadError) {
      setDetailError(loadError instanceof Error ? loadError.message : '审计详情加载失败。');
    } finally {
      setIsDetailLoading(false);
    }
  }

  return (
    <div className="r22-page r26-page r25a-audit-page admin-cc-audit-page" data-testid="admin-audit-page">
      <AdminControlNavigation active="audit-logs" />
      <header className="r22-page-hero r25a-audit-hero">
        <div>
          <p className="r22-overline">系统管理 · 只读</p>
          <h1>审计日志</h1>
          <p>查看登录、项目、工序、评审、收费、材料、颜色退出和后台操作记录。</p>
        </div>
        <div className="r25a-audit-actions">
          <button
            type="button"
            className="r22-button r22-button-secondary"
            disabled={isLoading}
            onClick={() => void load(query)}
          >
            刷新
          </button>
          <button
            type="button"
            className="r22-button r22-button-primary"
            data-testid="admin-audit-filter-button"
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((value) => !value)}
          >
            高级筛选
          </button>
        </div>
      </header>

      <section className="r22-kpi-grid r25a-audit-kpis" aria-label="审计摘要" data-testid="admin-audit-summary">
        <R22Kpi label="今日操作" value={data?.summary.todayCount ?? '—'} hint="今天新增记录" tone="brand" />
        <R22Kpi label="失败操作" value={data?.summary.failureCount ?? '—'} hint="当前筛选范围" tone={data?.summary.failureCount ? 'danger' : 'success'} />
        <R22Kpi label="筛选结果" value={data?.summary.filteredCount ?? '—'} hint="服务端有界查询" tone="neutral" />
      </section>

      <section className="r22-card r25a-audit-filter-card" aria-label="审计日志筛选" data-testid="admin-audit-filter-panel">
        <div className="r25a-audit-filter-grid">
          <FilterField label="开始日期"><input type="date" data-testid="admin-audit-date-range" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></FilterField>
          <FilterField label="结束日期"><input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></FilterField>
          <FilterField label="操作者"><input data-testid="admin-audit-actor-filter" value={filters.actorName} maxLength={100} placeholder="姓名" onChange={(event) => setFilters({ ...filters, actorName: event.target.value })} /></FilterField>
          <FilterField label="动作类型"><input data-testid="admin-audit-action-filter" value={filters.action} maxLength={100} placeholder="例如 ATTACHMENT_UPLOADED" onChange={(event) => setFilters({ ...filters, action: event.target.value })} /></FilterField>
          <FilterField label="项目"><input data-testid="admin-audit-project-filter" value={filters.projectId} maxLength={128} placeholder="项目 ID" onChange={(event) => setFilters({ ...filters, projectId: event.target.value })} /></FilterField>
          <FilterField label="结果"><input data-testid="admin-audit-result-filter" value={filters.result} maxLength={64} placeholder="例如 APPROVED" onChange={(event) => setFilters({ ...filters, result: event.target.value })} /></FilterField>
          <FilterField label="关键词" wide><input data-testid="admin-audit-keyword-input" value={filters.keyword} maxLength={200} placeholder="动作、摘要、对象或项目" onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} /></FilterField>
        </div>
        {showAdvanced ? (
          <div className="r25a-audit-filter-grid r25a-audit-advanced" data-testid="audit-advanced-filters">
            <FilterField label="对象类型"><select value={filters.entityType} onChange={(event) => setFilters({ ...filters, entityType: event.target.value })}><option value="">全部</option>{ENTITY_OPTIONS.map((value) => <option value={value} key={value}>{formatCode(value)}</option>)}</select></FilterField>
            <FilterField label="对象 ID"><input value={filters.entityId} maxLength={128} onChange={(event) => setFilters({ ...filters, entityId: event.target.value })} /></FilterField>
            <FilterField label="requestId"><input value={filters.requestId} maxLength={128} onChange={(event) => setFilters({ ...filters, requestId: event.target.value })} /></FilterField>
          </div>
        ) : null}
        <div className="r25a-audit-filter-actions">
          <button type="button" className="r22-button r22-button-primary" data-testid="admin-audit-apply-filters" onClick={applyFilters}>应用筛选</button>
          <button type="button" className="r22-button r22-button-secondary" data-testid="admin-audit-clear-filters" onClick={clearFilters}>清空</button>
        </div>
      </section>

      <section className="r22-card r25a-audit-list-card">
        <div className="r22-section-heading r25a-audit-list-heading">
          <div><p className="r22-overline">审计追踪</p><h2>操作记录</h2><p>按时间和日志 ID 稳定排序，详情单独读取并统一脱敏。</p></div>
          <label className="r25a-audit-sort">排序<select aria-label="审计日志排序" data-testid="admin-audit-sort" value={query.sort ?? 'createdAt:desc'} onChange={(event) => commitQuery({ ...query, page: 1, sort: event.target.value as NonNullable<AdminAuditQuery['sort']> })}><option value="createdAt:desc">最新优先</option><option value="createdAt:asc">最早优先</option></select></label>
        </div>

        {error ? <div className="r22-inline-alert" data-testid="admin-audit-error-state"><span>{error}</span><button type="button" data-testid="admin-audit-retry-button" onClick={() => void load(query)}>重新加载</button></div> : null}
        {isLoading && !data ? <div className="r25a-audit-loading" aria-label="正在加载审计日志">正在加载审计日志…</div> : null}
        {!isLoading && data && data.items.length === 0 ? <div className="r22-empty-compact" data-testid="admin-audit-empty-state"><strong>没有符合条件的审计记录</strong><p>请调整时间范围或筛选条件后重试。</p></div> : null}
        {data && data.items.length ? (
          <div className="r25a-audit-table-wrap" data-testid="admin-audit-table">
            <table className="r25a-audit-table">
              <thead><tr><th>时间</th><th>操作者</th><th>动作</th><th>对象</th><th>项目</th><th>结果</th><th>请求编号</th><th>操作</th></tr></thead>
              <tbody>{data.items.map((item) => <tr key={item.id} data-testid="admin-audit-row" data-audit-log-id={item.id}><td data-label="时间"><time>{formatDateTime(item.createdAt)}</time></td><td data-label="操作者"><strong>{item.actorName}</strong><small>{item.actorRole ?? '系统'}</small></td><td data-label="动作"><strong>{formatCode(item.action)}</strong><small>{item.summary}</small></td><td data-label="对象"><span>{formatCode(item.entityType)}</span><small>{item.entityId}</small></td><td data-label="项目">{item.projectName ?? '—'}</td><td data-label="结果"><R22StatusBadge tone={getResultTone(item.result)}>{item.result ? formatCode(item.result) : '已记录'}</R22StatusBadge></td><td data-label="请求编号"><code>{item.requestId ?? '—'}</code></td><td data-label="操作" data-testid="admin-audit-detail-button"><button type="button" data-testid={`admin-audit-detail-${item.id}`} className="r22-text-link r25a-audit-detail-button" onClick={() => void openDetail(item.id)}>查看详情</button></td></tr>)}</tbody>
            </table>
          </div>
        ) : null}

        {data ? <div className="r25a-audit-pagination" aria-label="审计日志分页" data-testid="admin-audit-pagination"><span>第 {data.page} / {data.totalPages} 页 · 共 {data.total} 条</span><label>每页<select aria-label="每页条数" data-testid="admin-audit-page-size" value={data.pageSize} onChange={(event) => commitQuery({ ...query, page: 1, pageSize: Number(event.target.value) })}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label><button type="button" className="r22-button r22-button-secondary" data-testid="admin-audit-previous-page" disabled={data.page <= 1 || isLoading} onClick={() => commitQuery({ ...query, page: data.page - 1 })}>上一页</button><button type="button" className="r22-button r22-button-secondary" data-testid="admin-audit-next-page" disabled={!data.hasNextPage || isLoading} onClick={() => commitQuery({ ...query, page: data.page + 1 })}>下一页</button></div> : null}
      </section>

      {isDetailLoading || detail || detailError ? <AuditDetailDrawer detail={detail} isLoading={isDetailLoading} error={detailError} onClose={() => { setDetail(null); setDetailError(null); }} /> : null}
    </div>
  );
}

export function AuditDetailDrawer({ detail, isLoading, error, onClose }: { detail: AdminAuditDetailResponse | null; isLoading: boolean; error: string | null; onClose: () => void }) {
  return <div className="r25a-audit-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><aside className="r25a-audit-drawer" role="dialog" aria-modal="true" aria-labelledby="audit-detail-title" data-testid="admin-audit-detail-drawer" data-audit-log-id={detail?.id}><header><div><p className="r22-overline">只读 · 已脱敏</p><h2 id="audit-detail-title">审计详情</h2></div><button type="button" className="r22-icon-button" aria-label="关闭审计详情" onClick={onClose}>×</button></header>{isLoading ? <div className="r25a-audit-loading">正在安全读取详情…</div> : null}{error ? <div className="r22-inline-alert">{error}</div> : null}{detail ? <div className="r25a-audit-detail-body"><DetailItem label="审计 ID" value={detail.id} /><DetailItem label="操作时间" value={formatDateTime(detail.createdAt)} /><DetailItem label="操作者" value={`${detail.actorName}${detail.actorRole ? ` · ${detail.actorRole}` : ''}`} /><DetailItem label="动作" value={formatCode(detail.action)} /><DetailItem label="对象" value={`${formatCode(detail.entityType)} · ${detail.entityId}`} /><DetailItem label="项目" value={detail.projectName ?? '—'} /><DetailItem label="结果" value={detail.result ? formatCode(detail.result) : '已记录'} /><DetailItem label="请求编号" value={detail.requestId ?? '—'} /><DetailItem label="IP" value={detail.ipAddress ?? '未记录'} /><DetailItem label="原因" value={detail.reason ?? '—'} /><SafeJsonSection title="原值摘要" value={detail.beforeSummary} /><SafeJsonSection title="新值摘要" value={detail.afterSummary} /><SafeJsonSection title="安全元数据" value={detail.metadata} /></div> : null}</aside></div>;
}

function FilterField({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={wide ? 'is-wide' : undefined}><span>{label}</span>{children}</label>; }
function DetailItem({ label, value }: { label: string; value: string }) { return <div className="r25a-audit-detail-item"><span>{label}</span><strong>{value}</strong></div>; }
function SafeJsonSection({ title, value }: { title: string; value: unknown }) { return <section className="r25a-audit-json"><h3>{title}</h3><pre>{value === null ? '无' : JSON.stringify(value, null, 2)}</pre></section>; }

function filtersToQuery(filters: AuditFilterForm): AdminAuditQuery {
  return {
    ...(filters.from ? { from: `${filters.from}T00:00:00.000Z` } : {}),
    ...(filters.to ? { to: `${filters.to}T23:59:59.999Z` } : {}),
    ...Object.fromEntries(Object.entries(filters).filter(([key, value]) => value && key !== 'from' && key !== 'to')),
  };
}

function readQueryState(params: URLSearchParams | ReadonlyURLSearchParams) {
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = [25, 50, 100].includes(Number(params.get('pageSize'))) ? Number(params.get('pageSize')) : 25;
  const sort = params.get('sort') === 'createdAt:asc' ? 'createdAt:asc' as const : 'createdAt:desc' as const;
  const filters = { ...EMPTY_FILTERS };
  for (const key of Object.keys(filters) as Array<keyof AuditFilterForm>) {
    const value = params.get(key);
    if (value) filters[key] = key === 'from' || key === 'to' ? value.slice(0, 10) : value;
  }
  return { filters, query: { ...filtersToQuery(filters), page, pageSize, sort } };
}

type ReadonlyURLSearchParams = ReturnType<typeof useSearchParams>;
function formatDateTime(value: string) { return new Date(value).toLocaleString('zh-CN', { hour12: false }); }
const AUDIT_CODE_LABELS: Record<string, string> = {
  PROJECT: '项目',
  COLOR: '颜色',
  COLOR_EXIT: '颜色退出',
  WORKFLOW_TASK: '流程工序',
  REVIEW_RECORD: '评审记录',
  DEVELOPMENT_FEE: '开发收费',
  ATTACHMENT: '材料附件',
  USER: '用户',
  ROLE: '角色',
  SYSTEM: '系统',
  APPROVED: '已通过',
  REJECTED: '已退回',
  COMPLETED: '已完成',
  CREATED: '已创建',
  SUBMITTED: '已提交',
  FAILED: '失败',
  SUCCESS: '成功',
  WORKFLOW_FORM_SAVED: '工作流表单已保存',
  TASK_PROGRESS_SUBMITTED: '工序进展已提交',
  WORKFLOW_START: '流程已启动',
  WORKFLOW_SUBMIT: '流程已提交',
  WORKFLOW_COMPLETE: '流程已完成',
  WORKFLOW_INITIALIZED: '流程已初始化',
  WORKFLOW_APPROVE: '流程审批通过',
  WORKFLOW_REJECT: '流程评审退回',
  PROJECT_CREATED: '项目已创建',
  PROJECT_UPDATED: '项目已更新',
  VISUAL_DELTA_REVIEW_CREATED: '目视色差评审已创建',
  VISUAL_DELTA_REVIEW_SUBMITTED: '目视色差评审已提交',
  VISUAL_DELTA_REVIEW_APPROVED: '目视色差评审已通过',
  ATTACHMENT_DOWNLOADED: '材料已下载',
  ATTACHMENT_UPLOADED: '材料已上传',
  ATTACHMENT_REPLACED: '材料已替换',
  R26_ORDINARY_TASK_COMPLETED: '普通工序已完成',
  R26_PROGRESS_SUBMITTED: '工作进展已提交',
  R26_TASK_BLOCKER_RESOLVED: '工序阻塞已解除',
  R26_WORKFLOW_TASK_REASSIGNED: '工序负责人已调整',
  R26_PROJECT_ASSIGNMENTS_APPLIED: '项目分工配置已应用',
  R26_PROJECT_MEMBER_ADDED: '项目成员已添加',
  R26_PROJECT_MEMBER_REMOVED: '项目成员已移除',
  CABIN_REVIEW_CREATED: '驾驶室评审已创建',
  CABIN_REVIEW_SUBMITTED: '驾驶室评审已提交',
  CABIN_REVIEW_APPROVED: '驾驶室评审已通过',
  CABIN_REVIEW_REJECTED: '驾驶室评审已退回',
  CONSISTENCY_REVIEW_CREATED: '颜色一致性评审已创建',
  CONSISTENCY_REVIEW_SUBMITTED: '颜色一致性评审已提交',
  CONSISTENCY_REVIEW_APPROVED: '颜色一致性评审已通过',
  TRIAL_PRODUCTION_CREATED: '样车试制记录已创建',
  TRIAL_PRODUCTION_RECORD_COMPLETED: '样车试制记录已完成',
  TRIAL_PRODUCTION_TASK_COMPLETED: '样车试制工序已完成',
  FIRST_PRODUCTION_PLAN_CREATED: '首台生产计划已创建',
  FIRST_PRODUCTION_PLAN_CONFIRMED: '首台生产计划已确认',
  FIRST_PRODUCTION_PLAN_TASK_COMPLETED: '首台生产计划工序已完成',
  SCHEDULE_PLAN_CREATED: '排产计划已创建',
  SCHEDULE_PLAN_CONFIRMED: '排产计划已确认',
  SCHEDULE_PLAN_TASK_COMPLETED: '排产计划工序已完成',
  MASS_PRODUCTION_RECORD_CREATED: '批量生产记录已创建',
  MASS_PRODUCTION_RECORD_STARTED: '批量生产记录已开始',
  MASS_PRODUCTION_RECORD_COMPLETED: '批量生产记录已完成',
  MASS_PRODUCTION_TASK_COMPLETED: '批量生产工序已完成',
  COLOR_EXIT_CREATED: '颜色退出记录已创建',
  COLOR_EXIT_COMPLETED: '颜色退出已完成',
  PROJECT_COMPLETED_BY_COLOR_EXIT: '项目已随颜色退出完成',
  PROCUREMENT_COMPLETED: '采购已完成',
  PROJECT_RETROSPECTIVE_SAVED: '项目复盘已保存',
  ADMIN_TASK_SCHEDULE_CHANGED: '管理员已调整工序计划',
};
function formatCode(value: string) { return AUDIT_CODE_LABELS[value] ?? value.replaceAll('_', ' '); }
function getResultTone(result: string | null): 'success' | 'warning' | 'danger' | 'neutral' { if (!result) return 'neutral'; if (/fail|reject|error/i.test(result)) return 'danger'; if (/pending|condition/i.test(result)) return 'warning'; return 'success'; }
