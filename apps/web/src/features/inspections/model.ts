import type { RecordSheetColumn,RecordSheetRow,RecordSheetPatch,RecordSheetChange } from '../business-sheet/record-sheet-types';
import type { Fact,Layer,Snapshot,Occurrence,Measurement,Reading,Defect,BatchResult } from './client';
export const conclusionLabels={PENDING:'待判定',PASS:'合格',FAIL:'不合格'} as const;
export const layerLabels={occurrence:'车辆与样件台次',measurement:'测点与测量组',reading:'角度读数',defect:'缺陷记录'} as const;
export type RowMeta={layer:Layer;fact:Fact;occurrenceId:string;objectLabel:string;measurementId:string|null;measurement?:Measurement};
const column=(key:string,label:string,width=150)=>({key,label,width});
const common=[column('activityDate','检验日期'),column('baseName','生产基地'),column('batchLabel','批次说明'),column('objectCode','车辆 / 样件编号',190),column('objectKind','对象类型',100),column('vin','VIN',190),column('vehicleModel','车型'),column('vehicleClass','车辆分类',100),column('colorName','颜色名称'),column('formalCode','正式颜色编号'),column('boardCodes','参照色板',180),column('people','参与人员',180)];
const source=[column('sourceFile','来源文件',200),column('sourceSheet','来源工作表'),column('sourceRows','来源行号',100)];
export const columns:Record<Layer,RecordSheetColumn[]>={
 occurrence:[...common,column('overallConclusion','对象总体结论'),column('visualConclusion','目视结论',220),column('handlingOpinion','处理意见',220),column('note','备注',240),column('groups','测量组数',100),column('angles','角度读数数',110),column('defects','缺陷条数',100),column('photos','对象照片',160),...source],
 measurement:[...common,column('pointLabel','测点',170),column('groupLabel','测量组',150),column('instrumentLabel','仪器'),column('methodLabel','方法'),column('originalCriteria','原始判定依据',240),column('conclusion','测量组结论'),column('overallConclusion','对象总体结论'),column('angles','角度读数数',110),...source],
 reading:[column('pointLabel','测点（整组）',150),column('groupLabel','测量组（整组）',150),column('instrumentLabel','仪器（整组）',150),column('methodLabel','方法（整组）',150),column('angleLabel','测量角度',110),column('lValue','L*',100),column('aValue','a*',100),column('bValue','b*',100),column('deltaE','来源 ΔE',110),column('note','读数说明',220),...common,column('overallConclusion','对象总体结论'),column('originalCriteria','原始判定依据',240),...source],
 defect:[...common,column('description','缺陷描述',260),column('severityLabel','严重程度'),column('handlingOpinion','处理意见',240),column('pointLabel','所属测点'),column('groupLabel','所属测量组'),column('overallConclusion','对象总体结论'),column('photos','对象照片',160),...source],
};
export const fields:Record<Layer,readonly string[]>={occurrence:['overallConclusion','visualConclusion','handlingOpinion','note'],measurement:['pointLabel','groupLabel','instrumentLabel','methodLabel','originalCriteria','conclusion'],reading:['angleLabel','lValue','aValue','bValue','deltaE','note'],defect:['description','severityLabel','handlingOpinion']};
export const readingGroupFields=['pointLabel','groupLabel','instrumentLabel','methodLabel'] as const;
export function measurementDependency(id:string){return `measurement:${id}`;}
const collection={occurrence:'occurrences',measurement:'measurements',reading:'readings',defect:'defects'} as const;
function text(value:unknown):string|null{return value===null||value===undefined?null:String(value);}
export function buildRows(snapshot:Snapshot,layer:Layer,canEdit=true):RecordSheetRow<RowMeta>[] {
 const occurrences=new Map(snapshot.occurrences.map(x=>[x.id,x]));const measurements=new Map(snapshot.measurements.map(x=>[x.id,x]));
 const byOccurrence=new Map<string,Measurement[]>();for(const m of snapshot.measurements){const arr=byOccurrence.get(m.occurrenceId)??[];arr.push(m);byOccurrence.set(m.occurrenceId,arr);}
 const angleCounts=new Map<string,number>();for(const r of snapshot.readings)angleCounts.set(r.measurementId,(angleCounts.get(r.measurementId)??0)+1);
 return snapshot[collection[layer]].map(fact=>{
  const measurement=layer==='reading'?measurements.get((fact as Reading).measurementId):layer==='measurement'?fact as Measurement:layer==='defect'?(fact as Defect).measurementId?measurements.get((fact as Defect).measurementId!):undefined:undefined;
  const occurrence=layer==='occurrence'?fact as Occurrence:occurrences.get(layer==='reading'?measurement?.occurrenceId??'':(fact as Measurement|Defect).occurrenceId);
  if(!occurrence)throw new Error('检验从属记录缺少对应台次，请重新读取。');
  const groups=byOccurrence.get(occurrence.id)??[];const source=occurrence.originalSource;const activity=snapshot.activity;
  const values:Record<string,string|null>={activityDate:activity.activityDate.slice(0,10),baseName:activity.productionBase.name,batchLabel:activity.batchLabel,objectCode:occurrence.object.objectCode,objectKind:occurrence.object.objectKind==='VEHICLE'?'车辆':'样件',vin:occurrence.object.vin,vehicleModel:occurrence.object.vehicleModel,vehicleClass:occurrence.object.vehicleClass,colorName:occurrence.color.name,formalCode:occurrence.color.code,
   boardCodes:measurement?.standardVersion?.boardCode??([...new Set(groups.map(m=>m.standardVersion?.boardCode).filter(Boolean))].join('、')||null),
   people:activity.participants?.map(p=>p.person.name).join('、')??null,overallConclusion:conclusionLabels[occurrence.overallConclusion],visualConclusion:occurrence.visualConclusion,handlingOpinion:occurrence.handlingOpinion,note:occurrence.note,pointLabel:measurement?.pointLabel??null,groupLabel:measurement?.groupLabel??null,instrumentLabel:measurement?.instrumentLabel??null,methodLabel:measurement?.methodLabel??null,originalCriteria:measurement?.originalCriteria??null,groups:String(groups.length),angles:String(measurement?angleCounts.get(measurement.id)??0:groups.reduce((n,m)=>n+(angleCounts.get(m.id)??0),0)),defects:String(occurrence._count?.defects??snapshot.defects.filter(d=>d.occurrenceId===occurrence.id).length),photos:null,sourceFile:source?.fileName??null,sourceSheet:source?.sheetName??null,sourceRows:source?.rowNumbers.join('、')??null};
  for(const key of fields[layer])values[key]=text((fact as unknown as Record<string,unknown>)[key]);
  if(layer==='measurement')values.conclusion=conclusionLabels[(fact as Measurement).conclusion];
  if(layer==='occurrence')values.overallConclusion=conclusionLabels[occurrence.overallConclusion];
  return{id:fact.id,revision:fact.revision,values,editable:canEdit&&!activity.reviewRecord?.submittedAt?(layer==='reading'?[...readingGroupFields,...fields.reading]:fields[layer]):[],...(layer==='reading'&&measurement?{dependencies:{[measurementDependency(measurement.id)]:measurement.revision}}:{}),meta:{layer,fact,occurrenceId:occurrence.id,objectLabel:occurrence.object.objectCode,measurementId:measurement?.id??null,...(layer==='reading'&&measurement?{measurement}:{})}};
 });
}
function conclusion(value:string|null|undefined){const found=Object.entries(conclusionLabels).find(([code,label])=>value===label||value===code);if(!found)throw new Error('结论请选择待判定、合格或不合格。');return found[0];}
export function validate(row:RecordSheetRow<RowMeta>,field:string,value:string|null):string|undefined{
 if(!row.editable.includes(field))return'这个业务字段只读。';
 if(field==='conclusion'||field==='overallConclusion'){try{conclusion(value);return;}catch{return'请输入待判定、合格或不合格。';}}
 if(['lValue','aValue','bValue','deltaE'].includes(field)){if(value===null||value==='')return;if(!/^-?\d{1,8}(\.\d{1,6})?$/.test(value))return'请输入最多 6 位小数的数字；未知留空。';if(field==='deltaE'&&Number(value)<0)return'ΔE 不能为负数。';return;}
 if(['pointLabel','groupLabel','angleLabel','description'].includes(field)&&!value?.trim())return'此字段不能为空。';
 const max=field==='note'?row.meta?.layer==='occurrence'?4000:2000:field==='description'||field==='visualConclusion'||field==='handlingOpinion'||field==='originalCriteria'?2000:field==='angleLabel'||field==='severityLabel'?100:200;
 if(value&&value.length>max)return`最多 ${max} 个字符。`;
}
/** Build an index once per authorized snapshot. Selection and edits only visit
 * the changed groups, including loaded siblings hidden by filtering. */
export function createReadingNormalizer(snapshot:Snapshot){
 const siblings=new Map<string,string[]>();for(const reading of snapshot.readings){const ids=siblings.get(reading.measurementId)??[];ids.push(reading.id);siblings.set(reading.measurementId,ids);}
 return(changes:readonly RecordSheetChange[],rows:ReadonlyMap<string,RecordSheetRow<RowMeta>>):readonly RecordSheetChange[]=>{
  const groups=new Map<string,Map<string,string|null>>();const output:RecordSheetChange[]=[];
  for(const change of changes){
   const row=rows.get(change.id);
   if(row?.meta?.layer!=='reading'||!readingGroupFields.includes(change.field as typeof readingGroupFields[number])){output.push(change);continue;}
   const group=row.meta.measurementId;if(!group||!siblings.get(group)?.includes(change.id)||!row.editable.includes(change.field))throw new Error('所属测量组只读或不在已读取范围，整次编辑未应用。');
   const values=groups.get(group)??new Map<string,string|null>();const value=change.value===''?null:change.value;
   if(values.has(change.field)&&values.get(change.field)!==value)throw new Error('同一测量组在本次粘贴中的测点、组名、仪器或方法不一致，整次粘贴未应用。');
   values.set(change.field,value);groups.set(group,values);
  }
  for(const[group,values]of groups)for(const id of siblings.get(group)??[]){
   const row=rows.get(id);if(!row||row.meta?.measurementId!==group||[...values.keys()].some(field=>!row.editable.includes(field)))throw new Error('测量组的关联读数已不可编辑，请刷新核对，整次编辑未应用。');
   for(const[field,value]of values)output.push({id,field,value});
  }
  return output;
 };
}
type UpdateItem={entity:Layer;kind:'update';id:string;expectedRevision:number;values:Record<string,string|null>};
export function updateItems(rows:readonly RecordSheetRow<RowMeta>[],patches:RecordSheetPatch[]):UpdateItem[]{
 const map=new Map(rows.map(row=>[row.id,row]));const output:UpdateItem[]=[];const groups=new Map<string,{item:UpdateItem;changes:Map<string,string|null>}>();
 for(const patch of patches){
  const row=map.get(patch.id);if(!row?.meta)throw new Error('原检验事实不在已读取范围中。');
  const values={...row.values,...patch.changes};for(const[field,value]of Object.entries(patch.changes)){const error=validate(row,field,value);if(error)throw new Error(error);}
  const layer=row.meta.layer;
  if(layer!=='reading'||fields.reading.some(field=>Object.hasOwn(patch.changes,field))){
   const own:Record<string,string|null>={};for(const field of fields[layer])own[field]=field==='conclusion'||field==='overallConclusion'?conclusion(values[field]):values[field]===''?null:values[field]??null;
   if(layer==='measurement')own.standardVersionId=(row.meta.fact as Measurement).standardVersionId;
   output.push({entity:layer,kind:'update',id:patch.id,expectedRevision:patch.expectedRevision,values:own});
  }
  if(layer==='reading'&&readingGroupFields.some(field=>Object.hasOwn(patch.changes,field))){
   const measurement=row.meta.measurement;if(!measurement||measurement.id!==row.meta.measurementId)throw new Error('缺少真实测量组身份，不能保存关联字段。');
   const revision=patch.expectedDependencies?.[measurementDependency(measurement.id)];
   if(revision===undefined||revision!==measurement.revision)throw new Error('测量组版本已改变，请刷新并明确处理冲突。');
   let group=groups.get(measurement.id);
   if(!group){group={item:{entity:'measurement',kind:'update',id:measurement.id,expectedRevision:revision,values:{pointLabel:measurement.pointLabel,groupLabel:measurement.groupLabel,instrumentLabel:measurement.instrumentLabel,methodLabel:measurement.methodLabel,standardVersionId:measurement.standardVersionId,originalCriteria:measurement.originalCriteria,conclusion:measurement.conclusion}},changes:new Map()};groups.set(measurement.id,group);}
   if(group.item.expectedRevision!==revision)throw new Error('同一测量组提交了不同版本，整批未保存。');
   for(const field of readingGroupFields){if(!Object.hasOwn(patch.changes,field))continue;const value=patch.changes[field]===''?null:patch.changes[field]??null;
    if(group.changes.has(field)&&group.changes.get(field)!==value)throw new Error('同一测量组出现不同父字段值，整批未保存。');
    group.changes.set(field,value);group.item.values[field]=value;
   }
  }
 }
 const items=[...groups.values()].map(group=>group.item).concat(output);if(items.length>200)throw new Error('单批关联检验事实超过 200 条，请按显示行分批保存。');return items;
}

export function acknowledge(snapshot:Snapshot,result:BatchResult){
 snapshot.activity={...snapshot.activity,revision:result.revision};
 for(const item of result.items){const key=collection[item.entity];const list=snapshot[key] as Fact[];const at=list.findIndex(row=>row.id===item.id);if(at<0)throw new Error('保存响应缺少原记录身份。');list[at]={...list[at],...item} as Fact;}
}
