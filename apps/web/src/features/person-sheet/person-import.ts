import type { ExchangeInput } from '../business-sheet/record-exchange';
import type { ImportPlan } from '../business-sheet/record-import';
import type { RecordSheetRow } from '../business-sheet/record-sheet-types';
import { PERSON_COLUMNS, personChanges, validatePerson, type DepartmentOption, type PersonRecord } from './person-adapter';
/** Explicit identity only. Workbook positions and originalSource are provenance, never update keys. */
export function preparePersonImport(input: ExchangeInput, clear: readonly string[], context: { rows: readonly RecordSheetRow<PersonRecord>[]; departments: DepartmentOption[] }): ImportPlan {
  if (input.errors.length) return { input, status: 'error', message: input.errors.join('；') };
  const row = input.id ? context.rows.find(row => row.id === input.id) : undefined;
  if (input.id && !row) return { input, status: 'error', message: '记录不在当前可访问人员档案内。' };
  if (!input.id && input.revision !== null) return { input, status: 'error', message: '新增档案不能携带旧记录版本。' };
    if (row && input.revision !== row.revision) return { input, status: 'error', message: '记录版本冲突，请导出最新版本后核对。' };
    const allowed = row?.editable ?? ['name', 'departmentName', 'position', 'mobile', 'email', 'note', 'availability'];
    const changes: Record<string, string | null> = {};
    for (const [field, value] of Object.entries(input.values)) {
      if (field === 'photos' || (value === null || value === '') && !clear.includes(field)) continue;
      if (row && (row.values[field] ?? null) === value) continue;
      if (!allowed.includes(field)) return { input, status: 'error', message: `${PERSON_COLUMNS.find(column => column.key === field)?.label ?? field}是只读信息，不能导入修改。` };
      const issue = validatePerson(row ?? { id: input.clientId, revision: 1, values: input.values, editable: allowed }, field, value); if (issue) return { input, status: 'error', message: issue };
      changes[field] = value;
    }
    if (!row && !changes.name) return { input, status: 'error', message: '新人员档案必须填写姓名。' };
    try { const converted = personChanges(changes, context.departments); return { input, status: row ? Object.keys(changes).length ? 'update' : 'unchanged' : 'create', message: row ? Object.keys(changes).map(key => `${PERSON_COLUMNS.find(column => column.key === key)?.label}：${row.values[key] ?? '空'} → ${changes[key] ?? '空'}`).join('；') : '创建独立人员档案，不创建账号或业务资格。', data: converted }; }
    catch (cause) { return { input, status: 'error', message: cause instanceof Error ? cause.message : '字段关联无效' }; }
}
