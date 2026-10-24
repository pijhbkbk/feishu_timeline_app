import { apiRequest } from '../../lib/auth-client';
import type { ChoicePage } from './client';

export type ProjectColorScope = { projectId: string; colorId: string; baseId: string; label: string };
type ProjectColorDetail = { id: string; primaryColorId: string | null; colorId: string | null;
  colorName: string | null; productionBaseId: string | null; productionBaseName: string | null; name: string };

/** A display fallback or a matching name is not an explicit project-color association. */
export function projectColorScope(projectId: string, detail: ProjectColorDetail): ProjectColorScope {
  if (detail.id !== projectId || !detail.primaryColorId || detail.primaryColorId !== detail.colorId || !detail.productionBaseId) {
    throw new Error('该项目尚未明确关联颜色与基地，不能据名称推测抽检范围。请先核对项目颜色，或直接按准确颜色查询。');
  }
  return { projectId, colorId: detail.primaryColorId, baseId: detail.productionBaseId,
    label: `${detail.name} · ${detail.colorName ?? detail.primaryColorId} · ${detail.productionBaseName ?? detail.productionBaseId}` };
}

export async function readProjectColorScope(projectId: string, signal: AbortSignal) {
  return projectColorScope(projectId, await apiRequest<ProjectColorDetail>(`/projects/${encodeURIComponent(projectId)}`, { signal }));
}

export async function loadInspectionProjects(search: string, cursor: string | null, signal: AbortSignal): Promise<ChoicePage> {
  const page = cursor ?? '1';
  const data = await apiRequest<{ items: Array<{ id: string; name: string; code: string; colorName: string | null }>; totalPages: number }>(
    `/projects?${new URLSearchParams({ page, pageSize: '20', keyword: search })}`, { signal });
  return { items: data.items.map(p => ({ id: p.id, label: p.name, detail: `${p.code} · ${p.colorName ?? '颜色待关联'}` })),
    next: Number(page) < data.totalPages ? String(Number(page) + 1) : null };
}

export async function loadInspectionColors(baseId: string, search: string, cursor: string | null, signal: AbortSignal): Promise<ChoicePage> {
  const page = cursor ?? '1';
  const query = new URLSearchParams({ page, pageSize: '20', search });
  if (baseId) query.set('baseId', baseId);
  const data = await apiRequest<{ items: Array<{ id: string; name: string; formalCode: string | null; base: { name: string } | null }>; total: number }>(
    `/color-register?${query}`, { signal });
  return { items: data.items.map(c => ({ id: c.id, label: c.name,
    detail: `${c.base?.name ?? '基地未关联'} · ${c.formalCode ?? '正式编号未填'}` })),
    next: Number(page) * 20 < data.total ? String(Number(page) + 1) : null };
}
