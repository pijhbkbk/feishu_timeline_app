import React from 'react';
import { reviewStandardLabel, type ReviewStandardVersion } from '../lib/review-standard-version';

export function ReviewStandardSelect({ value, onChange, options = [], required = false, locked = false, disabled = false, hasMore = false }: {
  value: string; onChange: (value: string) => void; options?: ReviewStandardVersion[] | undefined;
  required?: boolean | undefined; locked?: boolean | undefined; disabled?: boolean | undefined; hasMore?: boolean | undefined;
}) {
  return <label className="field field-full"><span>评审标准版本</span>
    <select aria-label="评审标准版本" value={value} required={required && !locked} disabled={disabled || locked}
      onChange={event => onChange(event.target.value)}>
      <option value="">{locked ? '历史记录未关联标准版本' : required ? '请选择本轮已下发的标准版本' : '历史项目未关联颜色标准'}</option>
      {value && !options.some(item => item.id === value) ? <option value={value}>已固定标准 · {value}</option> : null}
      {options.map(item => <option key={item.id} value={item.id}>{reviewStandardLabel(item)}</option>)}
    </select>
    {locked ? <span className="muted">标准版本随评审记录保留，后续标准更正不会替换此记录。</span> : null}
    {required && !locked && options.length === 0 ? <span role="status">本轮尚无可引用的已下发标准版本，请先核对制板与下发记录。</span> : null}
    {hasMore ? <span className="muted">当前显示最近 100 个本轮已下发版本，请核对所需版本。</span> : null}
  </label>;
}
