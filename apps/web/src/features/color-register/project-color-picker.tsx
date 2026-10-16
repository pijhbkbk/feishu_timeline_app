'use client';

import React, { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/auth-client';
import type { RegisterRow } from './client';

export type ProjectColorChoice = { colorMode: 'NEW' | 'EXISTING'; colorName: string; productionBaseId: string; existingColorId: string };
type ExistingColor = Pick<RegisterRow, 'id' | 'name' | 'base' | 'formalCode' | 'manufacturer' | 'paintType' | 'boardCode' | 'sourceSummary' | 'revision'>;
type ColorOptionsResponse = { items: ExistingColor[]; facets: { bases: Array<{ id: string; name: string }> }; total: number; page: number; totalPages: number };

export function ProjectColorPicker({ value, onChange, disabled, existingOnly = false, onSelectedRevision }: { value: ProjectColorChoice; onChange: (value: ProjectColorChoice) => void; disabled: boolean; existingOnly?: boolean; onSelectedRevision?: (revision: number) => void }) {
  const [data, setData] = useState<ColorOptionsResponse | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true); setError('');
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ page: String(page), pageSize: value.colorMode === 'NEW' ? '1' : '20' });
      if (value.productionBaseId) params.set('baseId', value.productionBaseId);
      if (search && value.colorMode === 'EXISTING') params.set('search', search);
      void apiRequest<ColorOptionsResponse>(`/color-register?${params}`, { signal: controller.signal })
        .then(next => { if (active) setData(next); })
        .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : '颜色记录读取失败。'); })
        .finally(() => { if (active) setLoading(false); });
    }, search ? 250 : 0);
    const timeout = setTimeout(() => controller.abort(), 15000);
    return () => { active = false; clearTimeout(timer); clearTimeout(timeout); controller.abort(); };
  }, [value.colorMode, value.productionBaseId, search, page, reload]);

  return <fieldset disabled={disabled} className="m1-project-field-full" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
    <legend>颜色身份</legend>
    <div className="m1-project-form" style={{ padding: '12px 0' }}>
      {!existingOnly ? <label className="m1-project-field"><span>建立方式</span><select value={value.colorMode} onChange={event => { setPage(1); onChange({ ...value, colorMode: event.target.value as 'NEW' | 'EXISTING', existingColorId: '', colorName: '' }); }}><option value="NEW">新建颜色</option><option value="EXISTING">关联已有颜色</option></select></label> : null}
      <label className="m1-project-field"><span>生产基地</span><select required value={value.productionBaseId} onChange={event => { setPage(1); onChange({ ...value, productionBaseId: event.target.value, existingColorId: '', ...(value.colorMode === 'EXISTING' ? { colorName: '' } : {}) }); }}><option value="">请选择生产基地</option>{data?.facets.bases.map(base => <option key={base.id} value={base.id}>{base.name}</option>)}</select></label>
    </div>
    {value.colorMode === 'NEW' ? <p className="muted">先建立候选颜色，正式编号和入清单月份可暂缺。</p> : <>
      <label className="m1-project-field"><span>查找已有颜色</span><input type="search" maxLength={128} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
      {value.existingColorId ? <p role="status">已选择：{value.colorName} · {data?.facets.bases.find(base => base.id === value.productionBaseId)?.name}</p> : null}
      {!value.productionBaseId ? <p>请先选择生产基地，再核对准确的颜色记录。</p> : loading ? <p role="status">正在读取颜色清单…</p> : !error && !data?.items.length ? <p>{existingOnly ? '没有符合条件的颜色记录，请调整搜索。' : '没有符合条件的颜色记录，可调整搜索或新建颜色。'}</p> : !error ? <>
        <div className="table-shell" style={{ marginTop: 12 }}><table className="data-table"><thead><tr><th>选择</th><th>名称</th><th>色板编号</th><th>制作单位 / 漆种</th><th>来源</th></tr></thead><tbody>{data?.items.map(color => <tr key={color.id}><td><input type="radio" name="existing-color" aria-label={`选择${color.name}，${color.base?.name ?? '基地待核对'}，${color.boardCode ?? '色板编号未提供'}，${color.manufacturer ?? '单位未提供'}`} checked={value.existingColorId === color.id} disabled={disabled || !color.base} onChange={() => { if (color.base) { onChange({ colorMode: 'EXISTING', colorName: color.name ?? '', productionBaseId: color.base.id, existingColorId: color.id }); onSelectedRevision?.(color.revision); } }} /></td><td>{color.name}<br /><span className="muted">{color.formalCode ?? '正式编号未提供'}</span></td><td>{color.boardCode ?? '—'}</td><td>{color.manufacturer ?? '—'} / {color.paintType ?? '—'}</td><td>{color.sourceSummary ?? '项目颜色'}</td></tr>)}</tbody></table></div>
        {data && data.totalPages > 1 ? <div className="inline-actions"><button type="button" className="button button-secondary" disabled={disabled || page <= 1} onClick={() => setPage(page - 1)}>上一页</button><span>{page} / {data.totalPages}</span><button type="button" className="button button-secondary" disabled={disabled || page >= data.totalPages} onClick={() => setPage(page + 1)}>下一页</button></div> : null}
      </> : null}
    </>}
    {error ? <div role="alert"><p>{error}</p><button type="button" className="button button-secondary" disabled={disabled || loading} onClick={() => setReload(value => value + 1)}>重新读取颜色清单</button></div> : null}
  </fieldset>;
}
