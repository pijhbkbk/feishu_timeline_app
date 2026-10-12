'use client';
import { apiRequest } from '../../lib/auth-client';
import { fetchRegister, type RegisterList, type RegisterRow } from './client';
import type { SheetPatch } from './sheet-model';
export type SheetFacets = RegisterList['facets'] & { paintTypes?: string[]; manufacturers?: string[] };
export async function readCatalog(signal: AbortSignal) {
  const first = await fetchRegister({ search: '', baseId: '', status: '', page: 1, pageSize: 50 }, signal);
  const items = [...first.items];
  for (let page = 2; page <= Math.min(first.totalPages, 10); page++) {
    const result = await fetchRegister({ search: '', baseId: '', status: '', page, pageSize: 50 }, signal);
    items.push(...result.items);
  }
  // Stable IDs also protect against a list shifting while bounded pages are read.
  if (new Set(items.map(row => row.id)).size !== items.length) throw new Error('读取期间清单发生变化，请重新读取。');
  return { ...first, items, facets: first.facets as SheetFacets };
}
export function saveCatalog(items: SheetPatch[], operationId: string, reason: string) {
  return apiRequest<{ items: RegisterRow[] }>('/color-register/sheet', { method: 'PATCH', headers: { 'Idempotency-Key': operationId }, body: { operationId, items, ...(reason.trim() ? { reason: reason.trim() } : {}) }, signal: AbortSignal.timeout(30000) });
}
