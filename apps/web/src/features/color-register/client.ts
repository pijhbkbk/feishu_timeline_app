'use client';

import { apiRequest } from '../../lib/auth-client';

export type RegisterJson = null | boolean | number | string | RegisterJson[] | { [key: string]: RegisterJson };
export type RegisterSource = {
  fileName: string;
  sheetName: string;
  rowNumbers: number[];
};
export type RegisterRow = {
  id: string;
  colorId: string | null;
  name: string | null;
  formalCode: string | null;
  base: { id: string; name: string } | null;
  manufacturer: string | null;
  paintType: string | null;
  boardCode: string | null;
  registerMonth: string | null;
  registerStatus: string;
  productionApprovalStatus: string;
  note: string | null;
  revision: number;
  currentStandardVersionId: string | null;
  sourceSummary: string | null;
};
export type RegisterFilters = { search: string; baseId: string; status: string };
export type RegisterList = {
  items: RegisterRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  facets: { bases: Array<{ id: string; name: string }>; statuses: string[] };
  importSummary?: { fileName: string; sha256: string; sheetCount: number; rowCount: number; colorCount: number; pendingRowCount: number } | null;
};
export type RegisterStandardVersion = {
  id: string;
  versionNo: number;
  boardCode: string | null;
  manufacturer: string | null;
  paintType: string | null;
  effectiveDate: string | null;
  measurementDate: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  changeSummary: string | null;
  createdAt: string;
  conditions: string | null;
  originalControlLimits: string | null;
  measurements: Array<{ angle: string | number | null; l: number | string | null; a: number | string | null; b: number | string | null; originalControlLimits?: string | null }>;
  source: RegisterSource | null;
};
export type RegisterDetail = RegisterRow & {
  hueStandard: { id: string; name: string } | null;
  pendingReasons: string[];
  versions: RegisterStandardVersion[];
  versionsTotal: number;
  versionsPage: number;
  versionsTotalPages: number;
  sources: RegisterSource[];
  provenance: Array<{ fileName: string; sheetName: string; rowNumber: number; rawCells: RegisterJson }>;
  projects: Array<{ id: string; name: string }>;
  production: Array<{ id: string; month: string; metricScope: string; quantity: string | null; sourceCell: string | null }>;
  productionLimit: number;
  systemProduction: { items: Array<{ month: string; metricScope: string; quantity: string | null; recordCount: number; unknownQuantityCount: number }>; hasMore: boolean; undatedRecordCount: number };
};
export type RegisterNoteChange = { id: string; expectedRevision: number; note: string | null };

export function fetchRegister(query: RegisterFilters & { page: number; pageSize: number }, signal?: AbortSignal) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== '') search.set(key, String(value));
  return apiRequest<RegisterList>(`/color-register?${search}`, signal ? { signal } : {});
}
export function fetchRegisterDetail(id: string, versionsPage = 1, signal?: AbortSignal) {
  return apiRequest<RegisterDetail>(`/color-register/${encodeURIComponent(id)}?versionsPage=${versionsPage}&versionsPageSize=20`, signal ? { signal } : {});
}
export function saveRegisterNotes(items: RegisterNoteChange[], operationId: string) {
  return apiRequest<{ items: RegisterRow[] }>('/color-register/notes', {
    method: 'PATCH', headers: { 'Idempotency-Key': operationId },
    body: { operationId, items }, signal: AbortSignal.timeout(30000),
  });
}
