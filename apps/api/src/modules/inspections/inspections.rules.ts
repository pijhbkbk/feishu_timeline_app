import { parseBusinessFactSource, type BusinessFactSource } from '../../common/business-fact-source';
import { BadRequestException } from '@nestjs/common';
import { Prisma, type InspectionConclusion } from '@prisma/client';
import { identity, object, positiveInt, textField } from '../color-register/color-register.rules';
import { onlyFields } from '../production-facts/production-facts.rules';
export function activityDate(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) throw new BadRequestException('检验日期须为 YYYY-MM-DD。');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException('检验日期不存在。');
  return date;
}
export function conclusion(value: unknown): InspectionConclusion {
  if (!['PENDING', 'PASS', 'FAIL'].includes(value as string)) throw new BadRequestException('结论须明确选择待判定、合格或不合格。');
  return value as InspectionConclusion;
}
/** Decimal strings avoid float rounding; missing is distinct from zero. No derived judgment. */
export function instrumentNumber(value: unknown): Prisma.Decimal | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^-?\d{1,8}(\.\d{1,6})?$/.test(value)) throw new BadRequestException('仪器数值须为最多 6 位小数的数字文本，未知请留空。');
  return new Prisma.Decimal(value);
}
export type RecordRef = { id: string } | { clientId: string };
export function recordRef(value: unknown): RecordRef {
  const raw = object(value); onlyFields(raw, ['id', 'clientId']);
  if (Object.keys(raw).length !== 1) throw new BadRequestException('关联须指定正式 ID 或本批草稿标识。');
  return raw.id !== undefined ? { id: identity(raw.id) } : { clientId: identity(raw.clientId) };
}
export function nullableId(value: unknown) { return value === null ? null : identity(value); }
export function parseParticipants(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 50) throw new BadRequestException('参与人员最多 50 人。');
  const ids = value.map(item => identity(item, '人员 ID')).sort();
  if (new Set(ids).size !== ids.length) throw new BadRequestException('参与人员重复。');
  return ids;
}
export type OccurrenceValues = { overallConclusion: InspectionConclusion; visualConclusion: string | null; handlingOpinion: string | null; note: string | null };
export type MeasurementValues = { pointLabel: string; groupLabel: string; standardVersionId: string | null; instrumentLabel: string | null; methodLabel: string | null; originalCriteria: string | null; conclusion: InspectionConclusion };
export type ReadingValues = { angleLabel: string; lValue: Prisma.Decimal | null; aValue: Prisma.Decimal | null; bValue: Prisma.Decimal | null; deltaE: Prisma.Decimal | null; note: string | null };
export type DefectValues = { description: string; severityLabel: string | null; handlingOpinion: string | null };
export function occurrenceValues(raw: unknown): OccurrenceValues {
  const v = object(raw); onlyFields(v, ['overallConclusion','visualConclusion','handlingOpinion','note']);
  return { overallConclusion: conclusion(v.overallConclusion), visualConclusion: textField(v.visualConclusion,'目视结论',2000), handlingOpinion: textField(v.handlingOpinion,'处理意见',2000), note: textField(v.note,'备注',4000) };
}
export function measurementValues(raw: unknown): MeasurementValues {
  const v=object(raw); onlyFields(v,['pointLabel','groupLabel','standardVersionId','instrumentLabel','methodLabel','originalCriteria','conclusion']);
  return { pointLabel: textField(v.pointLabel,'测点',200,true)!, groupLabel: textField(v.groupLabel,'测量组',200,true)!, standardVersionId: nullableId(v.standardVersionId), instrumentLabel: textField(v.instrumentLabel,'仪器',200), methodLabel: textField(v.methodLabel,'方法',200), originalCriteria: textField(v.originalCriteria,'原始判定依据',2000), conclusion: conclusion(v.conclusion) };
}
export function readingValues(raw: unknown): ReadingValues {
  const v=object(raw); onlyFields(v,['angleLabel','lValue','aValue','bValue','deltaE','note']);
  const deltaE=instrumentNumber(v.deltaE);
  if (deltaE?.isNegative()) throw new BadRequestException('ΔE 不能为负数。');
  return { angleLabel: textField(v.angleLabel,'角度',100,true)!,lValue:instrumentNumber(v.lValue),aValue:instrumentNumber(v.aValue),bValue:instrumentNumber(v.bValue),deltaE,note:textField(v.note,'读数说明',2000) };
}
export function defectValues(raw: unknown): DefectValues {
  const v=object(raw); onlyFields(v,['description','severityLabel','handlingOpinion']);
  return { description:textField(v.description,'缺陷描述',2000,true)!,severityLabel:textField(v.severityLabel,'严重程度',100),handlingOpinion:textField(v.handlingOpinion,'处理意见',2000) };
}
type Change<T extends string,V,C> = { entity:T; values:V } & ({kind:'create';clientId:string}&C | {kind:'update';id:string;expectedRevision:number});
export type InspectionChange = Change<'occurrence',OccurrenceValues,{objectId:string;colorId:string;source:BusinessFactSource|null}> | Change<'measurement',MeasurementValues,{occurrence:RecordRef}> | Change<'reading',ReadingValues,{measurement:RecordRef}> | Change<'defect',DefectValues,{occurrence:RecordRef;measurement:RecordRef|null}>;
export function parseInspectionBatch(raw: unknown) {
  const body=object(raw); onlyFields(body,['operationId','expectedRevision','items']);
  if(!Array.isArray(body.items)||!body.items.length||body.items.length>200) throw new BadRequestException('一次保存 1–200 条检验事实。');
  const items:InspectionChange[]=body.items.map(rawItem=>{
    const item=object(rawItem);
    if(item.kind!=='create'&&item.kind!=='update') throw new BadRequestException('检验操作不正确。');
    if(!['occurrence','measurement','reading','defect'].includes(item.entity as string)) throw new BadRequestException('检验层级不正确。');
    const common=['entity','kind','values'];
    onlyFields(item,item.kind==='update'?[...common,'id','expectedRevision']:[...common,'clientId',...(item.entity==='occurrence'?['objectId','colorId','source']:item.entity==='measurement'?['occurrence']:item.entity==='reading'?['measurement']:['occurrence','measurement'])]);
    const base=item.kind==='create'?{kind:'create' as const,clientId:identity(item.clientId)}:{kind:'update' as const,id:identity(item.id),expectedRevision:positiveInt(item.expectedRevision,'事实版本')};
    switch(item.entity){
      case 'occurrence':return {...base,entity:'occurrence',values:occurrenceValues(item.values),...(item.kind==='create'?{objectId:identity(item.objectId),colorId:identity(item.colorId),source:parseBusinessFactSource(item.source)}:{})} as InspectionChange;
      case 'measurement':return {...base,entity:'measurement',values:measurementValues(item.values),...(item.kind==='create'?{occurrence:recordRef(item.occurrence)}:{})} as InspectionChange;
      case 'reading':return {...base,entity:'reading',values:readingValues(item.values),...(item.kind==='create'?{measurement:recordRef(item.measurement)}:{})} as InspectionChange;
      default:return {...base,entity:'defect',values:defectValues(item.values),...(item.kind==='create'?{occurrence:recordRef(item.occurrence),measurement:item.measurement===null?null:recordRef(item.measurement)}:{})} as InspectionChange;
    }
  });
  const keys=items.map(item=>item.kind==='create'?`new:${item.clientId}`:`${item.entity}:${item.id}`);
  if(new Set(keys).size!==items.length) throw new BadRequestException('同一事实或草稿标识不能重复提交。');
  if(Buffer.byteLength(JSON.stringify(items))>512*1024) throw new BadRequestException('单批检验内容过大。');
  const order={occurrence:0,measurement:1,reading:2,defect:3};
  items.sort((a,b)=>order[a.entity]-order[b.entity]);
  return {operationId:identity(body.operationId),expectedRevision:positiveInt(body.expectedRevision,'活动版本'),items};
}
