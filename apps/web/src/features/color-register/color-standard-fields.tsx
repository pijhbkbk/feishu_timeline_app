'use client';

import React from 'react';

export type ColorMeasurementDraft = { angle: string; l: string; a: string; b: string; originalControlLimits: string };
export type ColorStandardDraft = {
  measurements: ColorMeasurementDraft[];
  conditions: string; originalControlLimits: string; measurementDate: string; issueDate: string; expiryDate: string;
  manufacturer: string; paintType: string; changeSummary: string;
};
const emptyMeasurement = (): ColorMeasurementDraft => ({ angle: '', l: '', a: '', b: '', originalControlLimits: '' });
export function emptyColorStandardDraft(): ColorStandardDraft {
  return { measurements: [emptyMeasurement()], conditions: '', originalControlLimits: '', measurementDate: '', issueDate: '', expiryDate: '', manufacturer: '', paintType: '', changeSummary: '' };
}
const original = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
export function colorStandardDraftFromData(data: Record<string, unknown>): ColorStandardDraft {
  const rows = Array.isArray(data.measurements) ? data.measurements : [];
  return { measurements: rows.map(value => {
    const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
    return { angle: original(row.angle), l: original(row.l), a: original(row.a), b: original(row.b), originalControlLimits: original(row.originalControlLimits) };
  }),
    conditions: original(data.conditions), originalControlLimits: original(data.originalControlLimits), measurementDate: original(data.measurementDate),
    issueDate: original(data.issueDate), expiryDate: original(data.expiryDate), manufacturer: original(data.manufacturer), paintType: original(data.paintType), changeSummary: original(data.changeSummary) };
}
export function technicalDataFromDraft(value: ColorStandardDraft) {
  const nullable = (text: string) => text === '' ? null : text;
  return { measurements: value.measurements.map(row => ({ angle: nullable(row.angle), l: nullable(row.l), a: nullable(row.a), b: nullable(row.b), originalControlLimits: nullable(row.originalControlLimits) })),
    conditions: nullable(value.conditions), originalControlLimits: nullable(value.originalControlLimits), measurementDate: nullable(value.measurementDate),
    issueDate: nullable(value.issueDate), expiryDate: nullable(value.expiryDate), manufacturer: nullable(value.manufacturer), paintType: nullable(value.paintType), changeSummary: nullable(value.changeSummary) };
}

export function ColorStandardFields({ value, onChange, disabled = false, requireChangeSummary = false }: {
  value: ColorStandardDraft; onChange: (value: ColorStandardDraft) => void; disabled?: boolean; requireChangeSummary?: boolean;
}) {
  const update = (key: Exclude<keyof ColorStandardDraft, 'measurements'>, next: string) => onChange({ ...value, [key]: next });
  function measurement(index: number, field: keyof ColorMeasurementDraft, next: string) {
    onChange({ ...value, measurements: value.measurements.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: next } : row) });
  }
  return <fieldset disabled={disabled} className="color-standard-fields" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
    <legend className="section-title">色板测量标准</legend>
    <div className="form-grid" style={{ marginTop: 16 }}>
      <label className="field"><span>制作单位</span><input maxLength={200} value={value.manufacturer} onChange={event => update('manufacturer', event.target.value)} /></label>
      <label className="field"><span>漆种</span><input maxLength={200} value={value.paintType} onChange={event => update('paintType', event.target.value)} /></label>
      <label className="field"><span>测量条件</span><textarea rows={2} maxLength={1000} value={value.conditions} onChange={event => update('conditions', event.target.value)} /></label>
      <label className="field"><span>原控制限</span><textarea rows={2} maxLength={4000} value={value.originalControlLimits} onChange={event => update('originalControlLimits', event.target.value)} /></label>
      <label className="field"><span>测量日期（原文）</span><input maxLength={100} value={value.measurementDate} onChange={event => update('measurementDate', event.target.value)} /></label>
      <label className="field"><span>发出日期（原文）</span><input maxLength={100} value={value.issueDate} onChange={event => update('issueDate', event.target.value)} /></label>
      <label className="field"><span>失效日期（原文）</span><input maxLength={100} value={value.expiryDate} onChange={event => update('expiryDate', event.target.value)} /></label>
    </div>
    <div className="table-shell" style={{ marginBlock: 16 }}><table className="data-table"><caption style={{ textAlign: 'left', padding: '8px 0' }}>多角度 L / a / b · 未提供的数值留空</caption><thead><tr><th>角度</th><th>L</th><th>a</th><th>b</th><th>该角度原控制限</th><th>操作</th></tr></thead><tbody>
      {value.measurements.map((row, index) => <tr key={index}>{(['angle', 'l', 'a', 'b', 'originalControlLimits'] as const).map(field => <td key={field}><input aria-label={`第${index + 1}行${field === 'originalControlLimits' ? '原控制限' : field === 'l' ? 'L' : field === 'angle' ? '角度' : field}`} maxLength={field === 'originalControlLimits' ? 1000 : 80} value={row[field]} style={{ minWidth: field === 'originalControlLimits' ? 160 : 70, width: '100%' }} onChange={event => measurement(index, field, event.target.value)} /></td>)}<td><button type="button" className="button button-secondary button-small" aria-label={`删除第${index + 1}行测量`} onClick={() => onChange({ ...value, measurements: value.measurements.filter((_, rowIndex) => rowIndex !== index) })}>删除</button></td></tr>)}
      {!value.measurements.length ? <tr><td colSpan={6}>尚未填写测量数据</td></tr> : null}
    </tbody></table></div>
    <button type="button" className="button button-secondary" disabled={disabled || value.measurements.length >= 32} onClick={() => onChange({ ...value, measurements: [...value.measurements, emptyMeasurement()] })}>增加角度</button>
    <label className="field" style={{ marginTop: 16 }}><span>{requireChangeSummary ? '更正原因' : '版本说明'}</span><textarea required={requireChangeSummary} maxLength={1000} rows={2} value={value.changeSummary} onChange={event => update('changeSummary', event.target.value)} /></label>
  </fieldset>;
}
