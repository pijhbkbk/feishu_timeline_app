'use client';
import React,{useEffect,useRef,useState}from'react';
import{apiRequest}from'../../lib/auth-client';
import{RecordImportDialog,type ImportPlan}from'../business-sheet/record-import';
import type{ExchangeInput}from'../business-sheet/record-exchange';
import type{RecordSheetColumn,RecordSheetRow}from'../business-sheet/record-sheet-types';
import type{SheetImage}from'../business-sheet/image-client';
import{allRows,readActivity,saveFacts,type InspectionObject,type Layer,type Snapshot}from'./client';
import{columns,fields,buildRows,layerLabels,updateItems,validate,type RowMeta}from'./model';
import{Dialog,message}from'./controls';
export type ImportStandard={id:string;colorId:string;boardCode:string|null;versionNo:number};
export type ImportBindings={standards:ImportStandard[];standardVersionId:string;objects:InspectionObject[];colors:Array<{id:string;name:string;formalCode:string|null;boardCode:string|null}>;objectId:string;colorId:string;occurrenceId:string;measurementId:string};
const identityColumns:RecordSheetColumn[]=[{key:'objectId',label:'对象ID',width:220},{key:'colorId',label:'颜色记录ID',width:220},{key:'occurrenceId',label:'检验台次ID',width:220},{key:'measurementId',label:'测量组ID',width:220},{key:'standardVersionId',label:'标准版本ID',width:220}];
export function exchangeColumns(layer:Layer){return[...columns[layer],...identityColumns];}
export function exchangeRows(snapshot:Snapshot,layer:Layer){return buildRows(snapshot,layer).map(row=>{const occurrence=snapshot.occurrences.find(value=>value.id===row.meta!.occurrenceId)!;const measurement=row.meta!.measurementId?snapshot.measurements.find(value=>value.id===row.meta!.measurementId):null;return{...row,values:{...row.values,objectId:occurrence.objectId,colorId:occurrence.colorId,occurrenceId:occurrence.id,measurementId:measurement?.id??null,standardVersionId:measurement?.standardVersionId??null}};});}
const conclusion=(value:string|null|undefined)=>({待判定:'PENDING',合格:'PASS',不合格:'FAIL',PENDING:'PENDING',PASS:'PASS',FAIL:'FAIL'} as Record<string,string>)[value??'待判定'];
const maybe=(value:string|null|undefined)=>value===undefined||value===''?null:value;
export function prepareInspectionImport(snapshot:Snapshot,layer:Layer,rows:RecordSheetRow<RowMeta>[],bindings:ImportBindings,input:ExchangeInput,clears:readonly string[]):ImportPlan{
 try{
  if(snapshot.activity.reviewRecord?.submittedAt)throw new Error('活动已随评审提交，不能导入覆盖。');
  const editable=fields[layer];const nonempty=Object.entries(input.values).filter(([field,value])=>value!==null&&value!==''||clears.includes(field));
  if(input.id){const current=rows.find(row=>row.id===input.id);if(!current)throw new Error('记录 ID 不属于当前活动和工作表。');if(current.revision!==input.revision)throw new Error(`版本冲突：文件 ${input.revision}，服务器 ${current.revision}。`);
   const changes:Record<string,string|null>={};for(const[field,value]of nonempty){if(!editable.includes(field)){if((current.values[field]??null)!==maybe(value))throw new Error(`只读字段「${exchangeColumns(layer).find(c=>c.key===field)?.label??field}」不能修改。`);continue;}if((current.values[field]??null)!==maybe(value))changes[field]=maybe(value);}
   if(!Object.keys(changes).length)return{input,status:'unchanged',message:'业务值未变；照片仍按台次处理。'};
   const data=updateItems(rows,[{id:current.id,expectedRevision:input.revision!,changes}])[0];return{input,status:'update',message:`按稳定 ID 更新 ${Object.keys(changes).length} 个字段`,data};
  }
  if(input.revision!==null)throw new Error('新增行不能携带旧记录版本。');
  const values:Record<string,string|null>={};for(const field of editable)values[field]=maybe(input.values[field]);
  if(layer==='occurrence')values.overallConclusion=input.values.overallConclusion??'待判定';if(layer==='measurement')values.conclusion=input.values.conclusion??'待判定';
  const pseudo:RecordSheetRow<RowMeta>={id:input.clientId,revision:1,values,editable,meta:{layer,fact:{} as RowMeta['fact'],occurrenceId:'',objectLabel:'',measurementId:null}};
  for(const field of editable){const issue=validate(pseudo,field,values[field]??null);if(issue)throw new Error(`${columns[layer].find(c=>c.key===field)?.label??field}：${issue}`);}
  if(layer==='occurrence')values.overallConclusion=conclusion(values.overallConclusion)!;if(layer==='measurement')values.conclusion=conclusion(values.conclusion)!;
  const base={entity:layer,kind:'create',clientId:input.clientId,values};let data:Record<string,unknown>;let targetOccurrence=layer==='occurrence'?undefined:snapshot.occurrences.find(item=>item.id===(input.values.occurrenceId||bindings.occurrenceId));const targetMeasurement=snapshot.measurements.find(item=>item.id===(input.values.measurementId||bindings.measurementId));
  if(layer==='occurrence'){
   const objectId=input.values.objectId||bindings.objectId,colorId=input.values.colorId||bindings.colorId;
   const object=bindings.objects.find(item=>item.id===objectId),color=bindings.colors.find(item=>item.id===colorId);if(!object||!color)throw new Error('新增台次须选择字典中的准确对象 ID 与活动基地颜色 ID。');
   if(snapshot.occurrences.some(item=>item.objectId===objectId))throw new Error('本次活动已有此对象，请使用系统模板记录 ID 更新原台次。');
   if(input.values.objectCode&&input.values.objectCode!==object.objectCode||input.values.colorName&&input.values.colorName!==color.name)throw new Error('文件对象或颜色名称与所选稳定 ID 不一致。');
   data={...base,objectId,colorId,source:input.source};
  }else if(layer==='measurement'){
   if(!targetOccurrence)throw new Error('新增测量组须明确选择本活动检验台次。');
   if(snapshot.measurements.some(item=>item.occurrenceId===targetOccurrence!.id&&item.pointLabel===values.pointLabel&&item.groupLabel===values.groupLabel))throw new Error('该台次测点与测量组已存在，请按记录 ID 更新。');
   const standardVersionId=maybe(input.values.standardVersionId||bindings.standardVersionId);if(standardVersionId&&!bindings.standards.some(item=>item.id===standardVersionId&&item.colorId===targetOccurrence!.colorId))throw new Error('标准版本须来自所选台次颜色的真实版本字典；先在关联范围中核对该台次与标准。');data={...base,occurrence:{id:targetOccurrence.id},values:{...values,standardVersionId}};
  }else if(layer==='reading'){
   if(!targetMeasurement)throw new Error('新增角度须明确选择本活动测量组。');targetOccurrence=snapshot.occurrences.find(item=>item.id===targetMeasurement!.occurrenceId);
   if(input.values.occurrenceId&&input.values.occurrenceId!==targetMeasurement.occurrenceId)throw new Error('角度的台次 ID 与测量组不一致。');
   if(snapshot.readings.some(item=>item.measurementId===targetMeasurement!.id&&item.angleLabel===values.angleLabel))throw new Error('该测量组角度已存在，请按记录 ID 更新。');
   data={...base,measurement:{id:targetMeasurement.id}};
  }else{
   if(!targetOccurrence)throw new Error('新增缺陷须明确选择本活动检验台次。');if(targetMeasurement&&targetMeasurement.occurrenceId!==targetOccurrence.id)throw new Error('缺陷测量组不属于所选台次。');
   data={...base,occurrence:{id:targetOccurrence.id},measurement:targetMeasurement?{id:targetMeasurement.id}:null};
  }
  // Explicit context columns can confirm the target, never silently retarget a row.
  if(input.values.activityDate&&input.values.activityDate!==snapshot.activity.activityDate.slice(0,10)||input.values.baseName&&input.values.baseName!==snapshot.activity.productionBase.name)throw new Error('来源日期或基地与当前活动不一致。');
  if(targetOccurrence&&input.values.objectId&&input.values.objectId!==targetOccurrence.objectId||targetOccurrence&&input.values.colorId&&input.values.colorId!==targetOccurrence.colorId)throw new Error('来源稳定对象/颜色 ID 与目标台次不一致。');
  return{input,status:'create',message:'新增当前活动的明确层级事实；不推进评审流程。',data};
 }catch(cause){return{input,status:'error',message:message(cause)};}
}
export function finalizeInspectionPlans(plans:ImportPlan[]):ImportPlan[]{
 const grains=new Map<string,ImportPlan[]>();
 for(const plan of plans){if(plan.status==='error'||plan.status==='unchanged')continue;const data=plan.data as {entity:Layer;kind:string;objectId?:string;occurrence?:{id:string};measurement?:{id:string};values:Record<string,string|null>};
  const grain=plan.status==='update'?`id:${plan.input.id}`:data.entity==='occurrence'?`object:${data.objectId}`:data.entity==='measurement'?`measure:${data.occurrence?.id}:${data.values.pointLabel?.trim()}:${data.values.groupLabel?.trim()}`:data.entity==='reading'?`reading:${data.measurement?.id}:${data.values.angleLabel?.trim()}`:null;
  if(grain){const list=grains.get(grain)??[];list.push(plan);grains.set(grain,list);}
 }
 const duplicates=new Set([...grains.values()].filter(list=>list.length>1).flat());
 return plans.map(plan=>duplicates.has(plan)?{...plan,status:'error',message:'同一文件重复写入同一业务对象、测量组、角度或记录 ID；请先核对来源行。'}:plan);
}
export function InspectionImport({snapshot,layer,images,onSaved,onClose}:{snapshot:Snapshot;layer:Layer;images:readonly SheetImage[];onSaved:()=>Promise<void>;onClose:()=>void}){
 const[bindings,setBindings]=useState<ImportBindings>({standards:snapshot.measurements.flatMap(item=>item.standardVersion?[{...item.standardVersion,colorId:snapshot.occurrences.find(row=>row.id===item.occurrenceId)!.colorId}]:[]),standardVersionId:'',objects:[],colors:[],objectId:'',colorId:'',occurrenceId:snapshot.occurrences[0]?.id??'',measurementId:''}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[ready,setReady]=useState(false);const requests=useRef(new Map<string,{operationId:string;expectedRevision:number;items:unknown[]}>());
 useEffect(()=>{const controller=new AbortController();const needed=layer==='occurrence'?Promise.all([allRows<InspectionObject>('/inspections/objects',controller.signal),allRows<ImportBindings['colors'][number]>(`/color-register?baseId=${snapshot.activity.productionBaseId}`,controller.signal)]):Promise.resolve([[],[]] as [InspectionObject[],ImportBindings['colors']]);void needed.then(([objects,colors])=>{if(!controller.signal.aborted)setBindings(current=>({...current,objects,colors}));}).catch(cause=>{if(!controller.signal.aborted)setError(message(cause));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[snapshot.activity.productionBaseId,layer]);
 useEffect(()=>{if(layer!=='measurement'||!bindings.occurrenceId)return;const occurrence=snapshot.occurrences.find(item=>item.id===bindings.occurrenceId);if(!occurrence)return;const controller=new AbortController();setLoading(true);setError('');
  void(async()=>{const list:ImportStandard[]=[];let page=1;let total=1;while(page<=total){const result=await apiRequest<{versions:Array<{id:string;boardCode:string|null;versionNo:number}>;versionsTotalPages:number}>(`/color-register/${occurrence.colorId}?versionsPage=${page}&versionsPageSize=50`,{signal:controller.signal});list.push(...result.versions.map(item=>({...item,colorId:occurrence.colorId})));total=result.versionsTotalPages;if(list.length>5000)throw new Error('颜色标准版本超过读取上限，请在业务记录中明确关联。');page++;}if(!controller.signal.aborted)setBindings(old=>({...old,standards:[...old.standards.filter(item=>item.colorId!==occurrence.colorId),...list]}));})().catch(cause=>{if(!controller.signal.aborted)setError(message(cause));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
 },[snapshot,layer,bindings.occurrenceId]);
 const rows=exchangeRows(snapshot,layer);
 if(!ready)return<Dialog title={`${layerLabels[layer]} · 导入关联范围`} onClose={onClose}><p>文件内稳定 ID 优先；未填写关联 ID 的新增行使用下方明确选择。名称和行号不会被自动匹配为业务身份。</p>{loading?<p role="status">正在读取可用对象与颜色字典…</p>:error?<p role="alert">{error}</p>:<>{layer==='occurrence'?<><label>默认对象（新增行没有对象 ID 时）<select value={bindings.objectId} onChange={e=>setBindings(old=>({...old,objectId:e.target.value}))}><option value="">要求文件逐行提供对象 ID</option>{bindings.objects.map(item=><option key={item.id} value={item.id}>{item.objectCode} · {item.vehicleModel??'车型未填'}</option>)}</select></label><label>默认颜色（新增行没有颜色 ID 时）<select value={bindings.colorId} onChange={e=>setBindings(old=>({...old,colorId:e.target.value}))}><option value="">要求文件逐行提供颜色 ID</option>{bindings.colors.map(item=><option key={item.id} value={item.id}>{item.name} · {item.formalCode??'编号未填'} · {item.boardCode??'色板未填'}</option>)}</select></label><p>未登记的车辆或样件须先在对象登记入口取得正式 ID。每个对象在同一活动仅有一个台次。</p></>:<><label>默认台次<select value={bindings.occurrenceId} onChange={e=>setBindings(old=>({...old,occurrenceId:e.target.value,measurementId:'',standardVersionId:''}))}><option value="">要求文件逐行提供台次 ID</option>{snapshot.occurrences.map(item=><option key={item.id} value={item.id}>{item.object.objectCode} · {item.color.name}</option>)}</select></label>{layer==='measurement'?<label>默认颜色标准版本<select value={bindings.standardVersionId} onChange={e=>setBindings(old=>({...old,standardVersionId:e.target.value}))}><option value="">未提供标准 ID 时保留待核对</option>{bindings.standards.filter(item=>item.colorId===snapshot.occurrences.find(row=>row.id===bindings.occurrenceId)?.colorId).map(item=><option key={item.id} value={item.id}>{item.boardCode??'未填色板编号'} · 版本 {item.versionNo}</option>)}</select></label>:null}{layer!=='measurement'?<label>默认测量组<select value={bindings.measurementId} onChange={e=>setBindings(old=>({...old,measurementId:e.target.value}))}><option value="">{layer==='defect'?'缺陷仅归属台次；可在文件指定测量组 ID':'要求文件逐行提供测量组 ID'}</option>{snapshot.measurements.filter(item=>!bindings.occurrenceId||item.occurrenceId===bindings.occurrenceId).map(item=><option key={item.id} value={item.id}>{snapshot.occurrences.find(row=>row.id===item.occurrenceId)?.object.objectCode} · {item.pointLabel} / {item.groupLabel}</option>)}</select></label>:null}<p>此层导入文字事实。现场照片请在“车辆与样件台次”层导入并绑定准确对象。</p></>}<button className="m1-button m1-primary" onClick={()=>setReady(true)}>确认关联规则并选择 Excel</button></>}</Dialog>;
 return<RecordImportDialog title={layerLabels[layer]} module={`inspection-${layer}`} columns={exchangeColumns(layer)} rows={rows} imageTarget="SHEET_INSPECTION" images={layer==='occurrence'?images:[]} allowImages={layer==='occurrence'}
 finalizePlans={finalizeInspectionPlans}
 prepare={(input,clears)=>prepareInspectionImport(snapshot,layer,rows,bindings,input,clears)}
 apply={async(plans:ImportPlan[],operationId:string)=>{
  let request=requests.current.get(operationId);if(!request){const latest=await readActivity(snapshot.activity.id,AbortSignal.timeout(15000));request={operationId,expectedRevision:latest.revision,items:plans.map(plan=>plan.data)};requests.current.set(operationId,request);}
  const result=await saveFacts(snapshot.activity.id,request);return plans.map(plan=>{const saved=result.items.find(item=>plan.status==='create'?item.clientId===plan.input.clientId:item.id===plan.input.id);if(!saved)throw new Error(`来源第 ${plan.input.row} 行未收到保存身份确认。`);return{clientId:plan.input.clientId,id:saved.id};});
 }} onSaved={onSaved} onClose={onClose}/>;
}
export async function exportInspection(snapshot:Snapshot,layer:Layer,visible:readonly RecordSheetRow<RowMeta>[],images:readonly SheetImage[]){
 const{downloadWorkbook,exportRecordWorkbook}=await import('../business-sheet/record-exchange');
 const ids=new Set(visible.map(row=>row.id));const rows=exchangeRows(snapshot,layer).filter(row=>ids.has(row.id));const bytes=await exportRecordWorkbook(layerLabels[layer],`inspection-${layer}`,exchangeColumns(layer),rows,layer==='occurrence'?images:[]);downloadWorkbook(bytes,`${layerLabels[layer]}-${snapshot.activity.activityDate.slice(0,10)}.xlsx`);
}
