import type { IWorkbookData } from '@univerjs/core';
import { apiRequest } from '../../lib/auth-client';
export interface WorkbookMeta {id:string;name:string;revision:number;snapshotHash:string;updatedAt:string}
export interface SavedWorkbook extends WorkbookMeta {snapshot:IWorkbookData}
export interface WorkbookRevision {revision:number;snapshotHash:string;createdAt:string;restoredFrom:number|null}
const readOptions=(signal?:AbortSignal)=>({signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
export const listWorkbooks=(after?:string,signal?:AbortSignal)=>apiRequest<{items:WorkbookMeta[];nextCursor:string|null}>(`/workbooks${after?`?after=${encodeURIComponent(after)}`:''}`,readOptions(signal));
export const readWorkbook=(id:string,signal?:AbortSignal)=>apiRequest<SavedWorkbook>(`/workbooks/${encodeURIComponent(id)}`,readOptions(signal));
export const createWorkbook=(snapshot:IWorkbookData,operationId:string)=>apiRequest<WorkbookMeta>('/workbooks',{method:'POST',signal:AbortSignal.timeout(30000),body:{id:snapshot.id,name:snapshot.name,snapshot,operationId}});
export const saveWorkbook=(id:string,body:{snapshot:IWorkbookData;expectedRevision:number;operationId:string})=>apiRequest<WorkbookMeta>(`/workbooks/${encodeURIComponent(id)}`,{method:'PUT',signal:AbortSignal.timeout(30000),body});
export const listRevisions=(id:string,before?:number,signal?:AbortSignal)=>apiRequest<{items:WorkbookRevision[];nextBefore:number|null}>(`/workbooks/${encodeURIComponent(id)}/revisions${before?`?before=${before}`:''}`,readOptions(signal));
export const restoreWorkbook=(id:string,expectedRevision:number,revision:number,operationId:string)=>apiRequest<WorkbookMeta>(`/workbooks/${encodeURIComponent(id)}/restore`,{method:'POST',signal:AbortSignal.timeout(30000),body:{expectedRevision,revision,operationId}});
