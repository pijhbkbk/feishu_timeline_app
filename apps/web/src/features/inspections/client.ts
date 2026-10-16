'use client';
import { apiRequest } from '../../lib/auth-client';
export type Conclusion='PENDING'|'PASS'|'FAIL';
export type Layer='occurrence'|'measurement'|'reading'|'defect';
export type Source={fileName:string;sheetName:string;rowNumbers:number[];fileHash:string};
export type Activity={id:string;activityDate:string;productionBaseId:string;batchLabel:string|null;note:string|null;revision:number;projectId:string|null;recurringTaskId:string|null;reviewRecordId:string|null;editable?:boolean;productionBase:{id:string;name:string};participants?:{personId:string;person:{id:string;name:string;isActive:boolean}}[];reviewRecord:{id:string;submittedAt:string|null;result:string}|null;recurringTask?:{id:string;plannedDate:string;periodLabel:string;status:string}|null;_count?:{occurrences:number}};
export type InspectionObject={id:string;objectCode:string;objectKind:'VEHICLE'|'SAMPLE';vin:string|null;vehicleModel:string|null;vehicleClass:string|null;revision:number;sampleId:string|null};
export type Occurrence={id:string;revision:number;activityId:string;objectId:string;colorId:string;overallConclusion:Conclusion;visualConclusion:string|null;handlingOpinion:string|null;note:string|null;originalSource:Source|null;object:InspectionObject;color:{id:string;name:string;code:string|null;productionBaseId:string|null};_count:{measurements:number;defects:number}};
export type Measurement={id:string;revision:number;occurrenceId:string;pointLabel:string;groupLabel:string;standardVersionId:string|null;instrumentLabel:string|null;methodLabel:string|null;originalCriteria:string|null;conclusion:Conclusion;standardVersion?:{id:string;boardCode:string|null;versionNo:number}|null;_count?:{readings:number}};
export type Reading={id:string;revision:number;measurementId:string;angleLabel:string;lValue:string|null;aValue:string|null;bValue:string|null;deltaE:string|null;note:string|null};
export type Defect={id:string;revision:number;occurrenceId:string;measurementId:string|null;description:string;severityLabel:string|null;handlingOpinion:string|null};
export type Fact=Occurrence|Measurement|Reading|Defect;
export type Snapshot={activity:Activity;occurrences:Occurrence[];measurements:Measurement[];readings:Reading[];defects:Defect[]};
export type Stats={uniqueVehicles:number;uniqueSamples:number;occurrences:number;measurementGroups:number;angleReadings:number;defects:number;passed:number;failed:number;pending:number;judged:number;passRate:number|null;passRateBasis:string};
export type Page<T>={items:T[];page:number;pageSize:number;total:number;totalPages?:number};
export function readActivity(id:string,signal?:AbortSignal){return apiRequest<Activity>(`/inspections/activities/${encodeURIComponent(id)}`,signal?{signal}:{});}
export function readStats(id:string,signal?:AbortSignal){return apiRequest<Stats>(`/inspections/statistics?activityId=${encodeURIComponent(id)}`,signal?{signal}:{});}
/** Bounded four-worker pagination. Every page must describe the same complete match count. */
export async function allRows<T>(path:string,signal:AbortSignal,max=5000):Promise<T[]>{
  const separator=path.includes('?')?'&':'?';const get=(page:number)=>apiRequest<Page<T>>(`${path}${separator}page=${page}&pageSize=50`,{signal});
  const first=await get(1);if(first.total>max)throw new Error(`本次活动该层有 ${first.total} 条，超过工作区 ${max} 条读取上限，请按真实活动范围拆分。`);
  const pages:Array<T[]>=[];pages[0]=first.items;let next=2;const last=Math.ceil(first.total/50);
  await Promise.all(Array.from({length:Math.min(4,last-1)},async()=>{while(next<=last){const page=next++;const data=await get(page);if(data.total!==first.total)throw new Error('活动记录在读取期间变化，请重新读取。');pages[page-1]=data.items;}}));
  const rows=pages.flat();if(rows.length!==first.total||new Set(rows.map(row=>(row as {id:string}).id)).size!==rows.length)throw new Error('活动行数已改变，请重新读取以避免漏行。');return rows;
}
export async function readSnapshot(id:string,signal:AbortSignal):Promise<Snapshot>{
  const before=await readActivity(id,signal);const path=`/inspections/activities/${encodeURIComponent(id)}/rows?layer=`;
  const [occurrences,measurements,readings,defects]=await Promise.all([allRows<Occurrence>(`${path}occurrence`,signal),allRows<Measurement>(`${path}measurement`,signal),allRows<Reading>(`${path}reading`,signal),allRows<Defect>(`${path}defect`,signal)]);
  const after=await readActivity(id,signal);if(before.revision!==after.revision)throw new Error('活动在读取期间被修改，请重新读取。');return{activity:after,occurrences,measurements,readings,defects};
}
export type BatchResult={activityId:string;revision:number;items:Array<Fact&{entity:Layer;clientId?:string}>};
export function saveFacts(id:string,body:unknown){return apiRequest<BatchResult>(`/inspections/activities/${encodeURIComponent(id)}/batch`,{method:'PATCH',body,signal:AbortSignal.timeout(30000)});}
export type Choice={id:string;label:string;detail?:string};
export type ChoicePage={items:Choice[];next:string|null};
export function listActivities(baseId='',page=1){return apiRequest<Page<Activity>>(`/inspections/activities?page=${page}&pageSize=25${baseId?`&baseId=${encodeURIComponent(baseId)}`:''}`,{signal:AbortSignal.timeout(15000)});}
