'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';

import {
  fetchAdminColorDatabase,
  type AdminColorDatabaseResponse,
} from '../lib/admin-client';
import { useAuth } from './auth-provider';

type Filters = {
  search: string;
  vehicleModel: string;
  colorType: string;
  status: string;
  completeness: 'ALL' | 'COMPLETE' | 'INCOMPLETE';
  year: string;
};

const EMPTY_FILTERS: Filters = {
  search: '',
  vehicleModel: '',
  colorType: '',
  status: '',
  completeness: 'ALL',
  year: '',
};

export function AdminColorDatabaseR26() {
  const { user } = useAuth();
  const isAdministrator = Boolean(user && (user.isSystemAdmin || user.roleCodes.includes('admin')));
  const [data, setData] = useState<AdminColorDatabaseResponse | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchAdminColorDatabase({
        page,
        pageSize: 12,
        search: appliedFilters.search,
        vehicleModel: appliedFilters.vehicleModel,
        colorType: appliedFilters.colorType,
        status: appliedFilters.status,
        completeness: appliedFilters.completeness,
        ...(appliedFilters.year ? { year: Number(appliedFilters.year) } : {}),
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '颜色数据库加载失败。');
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, page]);

  useEffect(() => { void load(); }, [load]);

  function submitFilters(event: React.FormEvent) {
    event.preventDefault();
    setPage(1);
    setAppliedFilters({ ...filters, search: filters.search.trim() });
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  }

  return (
    <main className="r26-color-db" data-testid="admin-color-database-page">
      <header className="r26-admin-subpage-header r26-color-db__header">
        <div>
          <Link href={isAdministrator ? '/admin' : '/dashboard'} className="r26-admin-back">
            ← {isAdministrator ? '返回系统概况' : '返回工作台'}
          </Link>
          <h1>颜色数据库</h1>
          <p>按颜色集中查看开发资料、标准色板、性能报告、评审记录和量产档案。</p>
        </div>
        <button type="button" className="r26-admin-home__refresh" onClick={() => void load()} disabled={loading}>
          {loading ? '刷新中…' : '刷新数据'}
        </button>
      </header>

      {error ? (
        <div className="r26-admin-home__error" role="alert">
          <span>{error}</span><button type="button" onClick={() => void load()}>重新加载</button>
        </div>
      ) : null}

      {data ? (
        <>
          <section className="r26-color-db__metrics" aria-label="颜色资料统计">
            <ArchiveMetric label="已归档颜色" value={data.summary.archivedColors} />
            <ArchiveMetric label="材料总数" value={data.summary.materialCount} />
            <ArchiveMetric label="材料不完整颜色" value={data.summary.incompleteColors} tone="risk" />
            <ArchiveMetric label="本月新增材料" value={data.summary.newMaterialsThisMonth} tone="archive" />
          </section>

          <form className="r26-color-db__filters" onSubmit={submitFilters}>
            <label className="r26-color-db__search">
              <span>检索颜色资料</span>
              <input
                value={filters.search}
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="搜索颜色名称、颜色编号、车型或项目编号"
              />
            </label>
            <FilterSelect label="车型" value={filters.vehicleModel} onChange={(value) => setFilters((current) => ({ ...current, vehicleModel: value }))} options={data.facets.vehicleModels} />
            <FilterSelect label="颜色类别" value={filters.colorType} onChange={(value) => setFilters((current) => ({ ...current, colorType: value }))} options={data.facets.colorTypes} />
            <FilterSelect label="当前状态" value={filters.status} onChange={(value) => setFilters((current) => ({ ...current, status: value }))} options={data.facets.statuses} formatOption={formatColorStatus} />
            <FilterSelect label="材料完整度" value={filters.completeness} onChange={(value) => setFilters((current) => ({ ...current, completeness: value as Filters['completeness'] }))} options={['COMPLETE', 'INCOMPLETE']} formatOption={(value) => value === 'COMPLETE' ? '完整' : '不完整'} />
            <FilterSelect label="年份" value={filters.year} onChange={(value) => setFilters((current) => ({ ...current, year: value }))} options={data.facets.years.map(String)} />
            <div className="r26-color-db__filter-actions">
              <button type="submit" className="r26-color-db__primary">查询</button>
              <button type="button" onClick={resetFilters}>清除</button>
            </div>
          </form>

          {data.items.length ? (
            <>
              <div className="r26-color-db__result-heading">
                <strong>{data.total} 个颜色档案</strong>
                <span>材料直接引用现有附件记录，未复制文件。</span>
              </div>
              <section className="r26-color-db__grid" aria-label="颜色档案">
                {data.items.map((item) => (
                  <article className="r26-color-card" key={item.id}>
                    <div className="r26-color-card__heading">
                      <span
                        className="r26-color-card__swatch"
                        style={{ backgroundColor: item.displayColor ?? '#d7dde7' }}
                        aria-label={item.displayColor ? `显示色值 ${item.displayColor}` : '尚未录入显示色值'}
                      />
                      <div>
                        <h2>{item.name}</h2>
                        <p>{item.code ? `颜色编号：${item.code}` : '临时颜色档案 · 尚未生成正式编号'}</p>
                      </div>
                      <span className="r26-color-card__status">{formatColorStatus(item.status)}</span>
                    </div>
                    {!item.displayColor ? <p className="r26-color-card__placeholder">尚未录入显示色值</p> : null}
                    <dl>
                      <div><dt>适用车型</dt><dd>{item.vehicleModels.join('、') || '尚未记录'}</dd></div>
                      <div><dt>来源项目</dt><dd>{item.projects.length} 个</dd></div>
                      <div><dt>归档材料</dt><dd>{item.materialCount} 份</dd></div>
                      <div><dt>工序覆盖</dt><dd>{item.coveredSteps} / 18</dd></div>
                    </dl>
                    <div className="r26-color-card__progress">
                      <div><span>材料完整度</span><strong>{item.completenessPercent}%</strong></div>
                      <span><i style={{ width: `${item.completenessPercent}%` }} /></span>
                    </div>
                    <footer>
                      <time dateTime={item.updatedAt}>更新于 {formatDate(item.updatedAt)}</time>
                      <Link href={`/admin/color-database/${item.id}`}>查看档案 <span aria-hidden="true">→</span></Link>
                    </footer>
                  </article>
                ))}
              </section>
              <nav className="r26-color-db__pagination" aria-label="颜色档案分页">
                <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>上一页</button>
                <span>第 {data.page} / {data.totalPages} 页</span>
                <button type="button" disabled={page >= data.totalPages || loading} onClick={() => setPage((current) => current + 1)}>下一页</button>
              </nav>
            </>
          ) : (
            <section className="r26-color-db__empty">
              <strong>没有找到符合条件的颜色档案</strong>
              <p>颜色档案会根据现有项目和工序材料自动形成，无需重新上传文件。</p>
              <button type="button" onClick={resetFilters}>清除筛选</button>
            </section>
          )}
        </>
      ) : loading ? <ColorDatabaseSkeleton /> : null}
    </main>
  );
}

function ArchiveMetric({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'risk' | 'archive' }) {
  return <article className={`r26-color-db__metric r26-color-db__metric--${tone}`}><span>{label}</span><strong>{value}</strong></article>;
}

function FilterSelect({ label, value, onChange, options, formatOption = (option) => option }: { label: string; value: string; onChange: (value: string) => void; options: string[]; formatOption?: (option: string) => string }) {
  return (
    <label><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">全部</option>{options.map((option) => <option value={option} key={option}>{formatOption(option)}</option>)}</select></label>
  );
}

function ColorDatabaseSkeleton() {
  return <div className="r26-color-db__skeleton" aria-label="正在加载颜色数据库">{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</div>;
}

export function formatColorStatus(status: string) {
  return ({ DRAFT: '开发中', ACTIVE: '使用中', APPROVED: '已批准', REJECTED: '已退回', ARCHIVED: '已归档', EXITED: '已退出' } as Record<string, string>)[status] ?? status;
}

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
