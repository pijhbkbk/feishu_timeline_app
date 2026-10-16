import { apiRequest } from '../../lib/auth-client';
import type { RecordSheetPatch, RecordSheetRow } from '../business-sheet/record-sheet-types';
export interface PersonRecord {
  id: string; revision: number; name: string; departmentId: string | null; department: { id: string; name: string } | null;
  position: string | null; email: string | null; mobile: string | null; note: string | null; isActive: boolean; editableFields: string[];
  account: { id: string; username: string; version: string; status: string; roles: { code: string; name: string }[]; teamAccessApproved: boolean; hasCredential: boolean } | null;
  originalSource: { fileHash: string; fileName: string; sheetName: string; rowNumbers: number[] } | null;
}
export interface DepartmentOption { id: string; name: string }
export const PERSON_COLUMNS = [
  { key: 'name', label: '姓名', width: 130 }, { key: 'departmentName', label: '部门', width: 160 }, { key: 'position', label: '岗位说明', width: 160 },
  { key: 'mobile', label: '电话', width: 150 }, { key: 'email', label: '邮箱', width: 210 }, { key: 'availability', label: '启用状态', width: 120 },
  { key: 'accountName', label: '关联账号', width: 180 }, { key: 'roles', label: '业务资格', width: 220 }, { key: 'note', label: '备注', width: 230 },
  { key: 'photos', label: '照片', width: 140 }, { key: 'sourceSummary', label: '导入来源', width: 240 },
];
export function personRow(person: PersonRecord): RecordSheetRow<PersonRecord> {
  return { id: person.id, revision: person.revision, meta: person, editable: person.editableFields.map(field => field === 'departmentId' ? 'departmentName' : field === 'isActive' ? 'availability' : field),
    values: { name: person.name, departmentName: person.department?.name ?? null, position: person.position, mobile: person.mobile, email: person.email, note: person.note,
      availability: person.isActive ? '启用' : '停用', accountName: person.account?.username ?? '未关联', roles: person.account?.roles.map(role => role.name).join('、') || '未授权', photos: null,
      sourceSummary: person.originalSource ? `${person.originalSource.fileName} / ${person.originalSource.sheetName} / ${person.originalSource.rowNumbers.join('、')}` : null } };
}
export async function readPersons(signal: AbortSignal) {
  const items: PersonRecord[] = []; let after = ''; let departments: DepartmentOption[];
  do {
    const result = await apiRequest<{ items: PersonRecord[]; nextCursor: string | null; facets: { departments: DepartmentOption[] } }>(`/persons?take=50${after ? `&after=${encodeURIComponent(after)}` : ''}`, { signal });
    items.push(...result.items); departments = result.facets.departments; after = result.nextCursor ?? '';
  } while (after && items.length < 2000);
  return { items, departments, hasMore: Boolean(after) };
}
export function personChanges(changes: Record<string, string | null>, departments: DepartmentOption[]) {
  return Object.fromEntries(Object.entries(changes).map(([field, value]) => {
    if (field === 'availability') { if (!['启用', '停用'].includes(value ?? '')) throw new Error('启用状态只能选择启用或停用。'); return ['isActive', value === '启用']; }
    if (field === 'departmentName') { const matches = departments.filter(option => option.name === value); if (value && matches.length !== 1) throw new Error('部门名称不唯一或不存在，请在详情中选择明确部门。'); return ['departmentId', value ? matches[0]!.id : null]; }
    return [field, value];
  }));
}
export async function savePersons(patches: RecordSheetPatch[], operationId: string, departments: DepartmentOption[]) {
  const result = await apiRequest<{ items: PersonRecord[] }>('/persons/sheet', { method: 'PATCH', body: { operationId, items: patches.map(patch => ({ ...patch, changes: personChanges(patch.changes, departments) })) } }); return result.items.map(personRow);
}
export function validatePerson(_row: RecordSheetRow<PersonRecord>, field: string, value: string | null) {
  if (field === 'name' && !value?.trim()) return '姓名不能为空。';
  if (value && value.length > (field === 'note' ? 2000 : field === 'mobile' ? 32 : field === 'email' ? 160 : 100)) return '文字超过该字段长度上限。';
  if (field === 'availability' && !['启用', '停用'].includes(value ?? '')) return '请选择启用或停用。';
  return undefined;
}
