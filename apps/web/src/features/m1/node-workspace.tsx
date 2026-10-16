'use client';

import { displayColorName } from './color-name';
import { M1FilePicker } from './file-picker';
import { readableFlowSummary } from './record-facts';
import React, { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { API_BASE_URL, apiRequest } from '../../lib/auth-client';
import type { SampleDetailResponse, SampleConfirmationSummary } from '../../lib/samples-client';
import { fetchProjectAttachmentDetail, type ProjectAttachmentSummary } from '../../lib/attachments-client';
import { canRecordNode, requireTaskSampleFacts, selectRecordedSample, paintFields, materialUploadTarget, type TaskSampleFacts, type TaskSample, type TaskSamplesResponse } from './record-facts';
import type { R26ProgressResponse, R26ProgressCommandResponse } from '../v2/real-types';
import { TaskWorkspace } from '../team-work/task-workspace';
import { M1Icon } from './icon';
import { nodeReturnHref } from './context';
import { useProjectUnsavedChanges } from './use-unsaved';
type Confirmation = SampleConfirmationSummary;
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function M1NodeWorkspace({projectId,taskId}:{projectId:string;taskId:string}) {
 const [context,setContext]=useState<R26ProgressResponse|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;setContext(null);setError('');void apiRequest<R26ProgressResponse>(`/v2/tasks/${encodeURIComponent(taskId)}/progress-context`,{signal:AbortSignal.timeout(15000)}).then(c=>{if(c.task.projectId!==projectId)throw Error('该节点不属于当前项目。');if(active)setContext(c);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'节点加载失败。');});return()=>{active=false;};},[projectId,taskId,retry]);
 if(error)return <section className="m1-card m1-state"><p role="alert">{error}</p><button className="m1-button" onClick={()=>setRetry(n=>n+1)}>重新加载</button></section>;
 if(!context)return <p className="m1-state" role="status">正在加载记录…</p>;
 if(!['PROJECT_INITIATION','DEVELOPMENT_REPORT','PAINT_DEVELOPMENT','SAMPLE_COLOR_CONFIRMATION'].includes(context.task.nodeCode))return <TaskWorkspace projectId={projectId} taskId={taskId}/>;
 return <M1Record key={`${projectId}:${taskId}`} initial={context} projectId={projectId} taskId={taskId}/>;
}
function M1Record({initial,projectId,taskId}:{initial:R26ProgressResponse;projectId:string;taskId:string}) {
 const router=useRouter(),search=useSearchParams(); const [data,setData]=useState(initial);
 const [facts,setFacts]=useState<TaskSampleFacts|null>(null),[history,setHistory]=useState<Confirmation[]>([]);
 const [factsLoading,setFactsLoading]=useState(true),[persistedSample,setPersistedSample]=useState<TaskSample|null>(null);
 const [approvedMaterial,setApprovedMaterial]=useState<ProjectAttachmentSummary|null>(null);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(''),[dirty,setDirty]=useState(false);
 const [form,setForm]=useState({date:canRecordNode(initial)?today():'',party:'',decision:'APPROVE',comment:'',sampleId:'',sampleNo:'',sampleName:'',approvalReference:'',demandSource:''});
 const [conflictDraft,setConflictDraft]=useState<typeof form|null>(null);
 const [file,setFile]=useState<File|null>(null);const [preview,setPreview]=useState<{name:string;url:string;type:string}|null>(null);

 const pending=useRef(false),ids=useRef(new Map<string,string>()),fileIds=useRef(new WeakMap<File,string>()),allowLeave=useProjectUnsavedChanges(dirty||Boolean(file));
 const isConfirmation=data.task.nodeCode==='SAMPLE_COLOR_CONFIRMATION';const isPaint=data.task.nodeCode==='PAINT_DEVELOPMENT';const isReport=!isConfirmation&&!isPaint;
 const active=canRecordNode(data);
 const paintLocked=isPaint && Boolean(persistedSample);
 const title=isConfirmation?'样板颜色确认':isPaint?'涂料开发记录':'已获批开发报告';
 const returnHref=nodeReturnHref(projectId,taskId,search.toString());
 const type=isConfirmation?'sample-confirmation-proof':isReport?'approved-development-report':'paint-development-proof';
 const currentMaterials=data.materials.current.filter(m=>m.materialType===type);
 const materials: Array<{id:string;fileName:string;mimeType:string;versionNo:number;downloadUrl:string|null}>=isReport&&approvedMaterial?[approvedMaterial]:currentMaterials;
 function key(value:string){let id=ids.current.get(value);if(!id){id=crypto.randomUUID();ids.current.set(value,id);}return id;}
 function change(field:keyof typeof form,value:string){setDirty(true);setForm(f=>({...f,[field]:value}));}
 function applyFacts(next:TaskSampleFacts, writable:boolean, preserveInput:boolean) {
  setFacts(next);setHistory(next.confirmations);
  const sample=selectRecordedSample(next,form.sampleId);
  const saved=next.confirmations.find(record=>record.taskId===taskId);
  if(preserveInput&&dirty&&(!writable||(isPaint&&sample)))setConflictDraft(previous=>previous??{...form});
  if(isPaint){setPersistedSample(sample);if(sample)setForm(old=>({...old,...paintFields(sample),sampleId:sample.id}));}
  else if(!writable){setForm(old=>({...old,date:saved?(saved.actualConfirmedAt||saved.confirmedAt).slice(0,10):'',party:saved?.confirmationParty||'',decision:saved?.decision||'',comment:saved?.comment||'',sampleId:saved?.sampleId||sample?.id||''}));}
  else if(!preserveInput)setForm(old=>({...old,sampleId:sample?.id||''}));
 }
 async function fetchFacts(){
  const response=await apiRequest<TaskSamplesResponse>(`/projects/${encodeURIComponent(projectId)}/samples?taskId=${encodeURIComponent(taskId)}`,{signal:AbortSignal.timeout(15000)});
  return requireTaskSampleFacts(response,taskId,data.task.nodeCode);
 }
 async function loadReport(writable:boolean){
  const result=await apiRequest<{approvalFacts:{approvedReportDate:string;approvalReference:string;demandSource:string;reportAttachmentId:string}|null}>(`/projects/${encodeURIComponent(projectId)}/development-report`,{signal:AbortSignal.timeout(15000)});
  if(result.approvalFacts){const report=result.approvalFacts;const material=await fetchProjectAttachmentDetail(projectId,report.reportAttachmentId);if(material.scanStatus!=='CLEAN'||material.isDeleted)throw Error('报告材料当前不可用，请核对项目记录。');setApprovedMaterial(material);if(!writable)setForm(old=>({...old,date:report.approvedReportDate.slice(0,10),approvalReference:report.approvalReference,demandSource:report.demandSource}));}else if(!writable)setForm(old=>({...old,date:'',approvalReference:'',demandSource:''}));
 }
 useEffect(()=>{let current=true;setFactsLoading(true);
  void (async()=>{try{if(isReport)await loadReport(active);else {const next=await fetchFacts();if(current)applyFacts(next,active,false);}}catch(e){if(current)setError(e instanceof Error?e.message:'记录加载失败。');}finally{if(current)setFactsLoading(false);}})();
  return()=>{current=false;};
 },[projectId,taskId]);
 useEffect(()=>()=>{if(preview?.url.startsWith('blob:'))URL.revokeObjectURL(preview.url);},[preview]);
 async function refresh(){setError('');try{const c=await apiRequest<R26ProgressResponse>(`/v2/tasks/${encodeURIComponent(taskId)}/progress-context`,{signal:AbortSignal.timeout(15000)});setData(c);if(dirty&&!canRecordNode(c))setConflictDraft(previous=>previous??{...form});if(isReport)await loadReport(canRecordNode(c));else applyFacts(await fetchFacts(),canRecordNode(c),true);setNotice(canRecordNode(c)?'已读取最新状态，未提交的输入已保留。':'节点已处理，未提交内容单独保留。');}catch(e){setError(e instanceof Error?e.message:'刷新失败。');throw e;}}
 async function upload(e:FormEvent){e.preventDefault();if(!file||pending.current)return;pending.current=true;setBusy('upload');setError('');setNotice('');let fid=fileIds.current.get(file);if(!fid){fid=crypto.randomUUID();fileIds.current.set(file,fid);}const id=key(`upload:${fid}:${data.taskVersion}`);const target=materialUploadTarget(taskId,type,data.materials.current);const body=new FormData();body.set('file',file);body.set('materialType',type);body.set('taskVersion',data.taskVersion);body.set('idempotencyKey',id);if(target.replacesAttachmentId)body.set('replacesAttachmentId',target.replacesAttachmentId);
 try{const result=await apiRequest<R26ProgressCommandResponse>(target.path,{method:'POST',headers:{'Idempotency-Key':id},body,signal:AbortSignal.timeout(120000)});if(!result.materialUploaded||!result.attachment)throw Error('未收到材料放行结果，请刷新检查后重试。');if(result.viewModel)setData(result.viewModel);else await refresh();setFile(null);setNotice('材料扫描通过，已保存。');}catch(e){setError(e instanceof Error?e.message:'材料上传失败，请重试。');}finally{pending.current=false;setBusy('');}}
 async function showPreview(attachment:typeof materials[number]){setError('');try{if(!attachment.downloadUrl)throw Error('该材料当前不可下载。');const response=await fetch(`${API_BASE_URL}${attachment.downloadUrl}`,{credentials:'include',cache:'no-store'});if(!response.ok)throw Error(response.status===401?'会话已失效，请重新登录。':'无法读取材料，请重试。');const blob=await response.blob();setPreview({name:attachment.fileName,type:attachment.mimeType,url:URL.createObjectURL(blob)});}catch(e){setError(e instanceof Error?e.message:'预览失败。');}}
 async function save(e:FormEvent){e.preventDefault();if(pending.current||!active||factsLoading||(!isReport&&!facts))return;setError('');setNotice('');if(!form.date){setError('请选择实际日期。');return;}if(isConfirmation&&!materials[0]){setError('请先上传并通过扫描的确认材料。');return;}if(isReport&&!materials[0]){setError('请先上传已获批开发报告。');return;}pending.current=true;setBusy('save');
 try{if(isConfirmation){if(!form.sampleId)throw Error('缺少本轮样板记录，请先完成涂料开发。');const body={sampleId:form.sampleId,taskId,taskVersion:data.taskVersion,actualConfirmedAt:form.date,confirmationParty:form.party.trim(),decision:form.decision,comment:form.comment.trim(),confirmationAttachmentId:materials[0]!.id};const id=key(`confirm:${JSON.stringify(body)}`);await apiRequest(`/projects/${encodeURIComponent(projectId)}/samples/confirm`,{method:'POST',headers:{'Idempotency-Key':id},body:{...body,idempotencyKey:id},signal:AbortSignal.timeout(30000)});
 }else if(isReport){const body={taskId,taskVersion:data.taskVersion,reportAttachmentId:materials[0]!.id,approvedReportDate:form.date,approvalReference:form.approvalReference.trim(),demandSource:form.demandSource.trim()};const id=key(`report:${JSON.stringify(body)}`);await apiRequest(`/projects/${encodeURIComponent(projectId)}/approved-report`,{method:'POST',headers:{'Idempotency-Key':id},body:{...body,idempotencyKey:id},signal:AbortSignal.timeout(30000)});
 }else{
  const scoped=await fetchFacts();
  let recorded=selectRecordedSample(scoped,persistedSample?.id);
  if(recorded && recorded.id!==persistedSample?.id){applyFacts(scoped,true,true);throw Error('已读取先前保存的样板，请核对后再次保存。');}
  if(!recorded){
   const body={sampleNo:form.sampleNo.trim(),sampleName:form.sampleName.trim(),sampleType:'PANEL',producedAt:form.date,remark:form.comment.trim(),taskId,taskVersion:data.taskVersion};
   const id=key(`paint:${JSON.stringify(body)}`);
   const response=await apiRequest<SampleDetailResponse>(`/projects/${encodeURIComponent(projectId)}/samples`,{method:'POST',headers:{'Idempotency-Key':id},body:{...body,idempotencyKey:id},signal:AbortSignal.timeout(30000)});
   recorded={...response.sample,location:response.sample.location};setPersistedSample(recorded);setForm(old=>({...old,...paintFields(recorded!),sampleId:recorded!.id}));
  }
  const latest=await apiRequest<R26ProgressResponse>(`/v2/tasks/${encodeURIComponent(taskId)}/progress-context`,{signal:AbortSignal.timeout(15000)});setData(latest);
  if(!canRecordNode(latest))throw Error('工序状态已变化，已读取保存记录。');
  const body={taskVersion:latest.taskVersion,completionReason:`样板已制作，实际日期 ${recorded.producedAt?.slice(0,10)||'未记录'}。${recorded.remark||''}`,acknowledgedConsequences:true};const id=key(`complete:${JSON.stringify(body)}`);
  await apiRequest(`/v2/tasks/${encodeURIComponent(taskId)}/complete`,{method:'POST',headers:{'Idempotency-Key':id},body:{...body,idempotencyKey:id},signal:AbortSignal.timeout(30000)});
 }
 allowLeave();setDirty(false);router.push(returnHref);router.refresh();
 }catch(e){setError(e instanceof Error?e.message:'保存失败，请重试。');}finally{pending.current=false;setBusy('');}}
 return <section className="m1-workspace"><div className="m1-breadcrumb"><Link className="m1-icon-button" href={returnHref} aria-label="返回来源"><M1Icon name="back"/></Link><Link href={`/projects/${encodeURIComponent(projectId)}`}>颜色项目</Link><span>/</span><span>{displayColorName(data.task.project.name,data.task.project.colorName)}</span><span>/</span><span>{title}</span></div><header className="m1-heading"><h1>{title}</h1><span className={`m1-badge${active?' warning':''}`}>{active?'待记录':data.task.statusLabel}</span></header>
 {error&&<div className="m1-error" role="alert">{error}<button type="button" className="m1-button" onClick={()=>void refresh().catch(()=>undefined)} disabled={!!busy}>读取最新状态</button></div>}{notice&&<p className="m1-notice" role="status">{notice}</p>}
 {factsLoading&&<p role="status">正在读取本轮记录…</p>}{paintLocked&&active&&<p className="m1-notice" role="status">样板已登记，可继续完成本轮工序。</p>}<div className="m1-record-grid"><form className="m1-card m1-record-form" onSubmit={e=>void save(e)}><div className="m1-fields"><label className="m1-field">{isConfirmation?'实际确认日期':isPaint?'实际制样日期':'报告批准日期'}<input aria-label={isConfirmation?'实际确认日期':isPaint?'实际制样日期':'报告批准日期'} type="date" required value={form.date} max={today()} disabled={!!busy||!active||paintLocked} onChange={e=>change('date',e.target.value)}/></label>
 {isConfirmation?<label className="m1-field">确认方<input required maxLength={120} value={form.party} disabled={!!busy||!active} onChange={e=>change('party',e.target.value)}/></label>:isReport?<label className="m1-field">批准依据<input required maxLength={200} value={form.approvalReference} disabled={!!busy||!active} onChange={e=>change('approvalReference',e.target.value)}/></label>:<label className="m1-field">样板编号<input required maxLength={64} value={form.sampleNo} disabled={!!busy||!active||paintLocked} onChange={e=>change('sampleNo',e.target.value)}/></label>}</div>
 {isReport&&<label className="m1-field">需求来源<input required maxLength={500} value={form.demandSource} disabled={!!busy||!active} onChange={e=>change('demandSource',e.target.value)}/></label>}
 {isPaint&&<label className="m1-field">样板名称<input required maxLength={128} value={form.sampleName} disabled={!!busy||!active||paintLocked} onChange={e=>change('sampleName',e.target.value)}/></label>}
 {isConfirmation&&<><label className="m1-field">样板<select value={form.sampleId} disabled={!!busy||!active} onChange={e=>change('sampleId',e.target.value)} required><option value="">选择本轮样板</option>{facts?.samples.map(s=><option key={s.id} value={s.id}>{s.sampleName} · {s.sampleNo} · V{s.versionNo}</option>)}</select></label><fieldset className="m1-field"><legend>结论</legend><div className="m1-button-group">{(active?[['APPROVE','通过'],['RETURN','需调整']]:[['APPROVE','通过'],['RETURN','需调整'],['REJECT','不通过']]).map(([value,label])=><label key={value} className="m1-choice"><input type="radio" name="decision" value={value} checked={form.decision===value} disabled={!!busy||!active} onChange={()=>change('decision',value!)}/>{label}</label>)}</div></fieldset></>}
 {!isReport&&<label className="m1-field">{isConfirmation?'意见':'制样记录'}<textarea required={isPaint||form.decision==='RETURN'} rows={4} maxLength={2000} value={form.comment} disabled={!!busy||!active||paintLocked} onChange={e=>change('comment',e.target.value)}/></label>}
 <footer className="m1-record-actions"><Link href={returnHref} className="m1-button">{active?'取消':'返回'}</Link>{active&&<button className="m1-button m1-primary" disabled={!!busy||factsLoading||(!isReport&&!facts)}><M1Icon name="check"/>{busy==='save'?'正在保存…':'保存并返回'}</button>}</footer></form>
 <aside className="m1-card"><h2>{isConfirmation?'确认材料':isReport?'已获批开发报告':'开发材料'}</h2><div className="m1-file-list">{!materials.length?<p className="m1-muted">尚无材料</p>:materials.map(m=><div className="m1-file" key={m.id}><M1Icon name="file"/><div><strong>{m.fileName}</strong><span>已放行 · V{m.versionNo}</span></div><button type="button" className="m1-icon-button" aria-label={`预览 ${m.fileName}`} onClick={()=>void showPreview(m)}><M1Icon name="zoomIn"/></button></div>)}</div>
 {active&&<form className="m1-material-upload" onSubmit={e=>void upload(e)}><M1FilePicker label={isConfirmation?'选择确认单':'选择材料'} file={file} disabled={!!busy} onChange={setFile}/><button className="m1-button" disabled={!!busy||!file}><M1Icon name="upload"/>{busy==='upload'?'正在传输并扫描…':isConfirmation?'上传确认单':'上传材料'}</button></form>}
 <h2>记录</h2><ul className="m1-history">{isPaint&&facts?.samples.map(sample=><li key={sample.id}><strong>{sample.sampleName} · {sample.sampleNo} · V{sample.versionNo}</strong><time>实际制样日期：{sample.producedAt?.slice(0,10)||'未记录'}</time>{sample.remark}</li>)}{history.map(h=><li key={h.id}><strong>{h.decision==='APPROVE'?'确认通过':h.decision==='REJECT'?'不通过':'需调整'} · {h.confirmationParty||'确认记录'}</strong><time>{h.actualConfirmedAt?.slice(0,10)||new Date(h.confirmedAt).toLocaleDateString('zh-CN')} · {h.confirmedByName}</time>{h.comment}</li>)}{data.task.flowLogs.map((l,i)=><li key={l.id||i}><strong>{readableFlowSummary(l.summary||l.actionLabel||'流程记录已更新')}</strong><time>{l.createdAt?new Date(l.createdAt).toLocaleString('zh-CN'):''} · {l.operatorName}</time></li>)}{!history.length&&!data.task.flowLogs.length&&(!isPaint||!facts?.samples.length)&&<li>暂无记录</li>}</ul>
 {data.materials.versions.length>0&&<details><summary>材料历史</summary><ul className="m1-history">{data.materials.versions.map(m=><li key={m.id}><a href={`${API_BASE_URL}${m.downloadUrl}`} target="_blank" rel="noopener noreferrer">{m.fileName} · V{m.versionNo}</a><time>{m.uploadedByName} · {new Date(m.uploadedAt).toLocaleString('zh-CN')}</time></li>)}</ul></details>}</aside></div>
 {conflictDraft&&<section className="m1-card m1-conflict-draft" aria-label="未提交内容"><h2>未提交内容</h2><dl><dt>实际日期</dt><dd>{conflictDraft.date||'未填写'}</dd><dt>{isConfirmation?'确认方':isPaint?'样板':'批准依据'}</dt><dd>{isConfirmation?conflictDraft.party:isPaint?`${conflictDraft.sampleNo} · ${conflictDraft.sampleName}`:conflictDraft.approvalReference}</dd><dt>{isReport?'需求来源':'意见 / 记录'}</dt><dd style={{whiteSpace:'pre-wrap'}}>{isReport?conflictDraft.demandSource:conflictDraft.comment}</dd>{isConfirmation&&<><dt>结论</dt><dd>{conflictDraft.decision==='APPROVE'?'通过':'需调整'}</dd></>}</dl></section>}
 {preview&&<MaterialPreview preview={preview} onClose={()=>setPreview(null)}/>}
 </section>;
}

function MaterialPreview({preview,onClose}:{preview:{name:string;url:string;type:string};onClose:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null);useEffect(()=>{dialog.current?.showModal();},[]);
 return <dialog ref={dialog} className="m1-modal" aria-label="材料预览" onCancel={e=>{e.preventDefault();onClose();}}><header><h2>{preview.name}</h2><button className="m1-icon-button" aria-label="关闭预览" onClick={onClose}><M1Icon name="close"/></button></header>{preview.type.startsWith('image/')?<img src={preview.url} alt={preview.name}/>:<p>材料已通过扫描，可下载查看。</p>}<a className="m1-button" href={preview.url} download={preview.name}>下载材料</a></dialog>;
}
