import { apiRequest } from '../../lib/auth-client';
import { validateServerDraftAck, validateServerDraftRead, validateServerDraftRequest, type ServerDraftRequest } from './server-draft-session';

const signalWithDeadline=(milliseconds:number,signal?:AbortSignal)=>signal?AbortSignal.any([signal,AbortSignal.timeout(milliseconds)]):AbortSignal.timeout(milliseconds);
const path=(id:string)=>{
  if(!/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(id))throw new Error('工作簿标识无效。');
  return `/workbooks/${encodeURIComponent(id)}/draft`;
};
/** Explicit calls only. The coordinator owns the immutable operation; transport never creates or retries one. */
export async function readServerDraft(workbookId:string,signal?:AbortSignal){
  const raw=await apiRequest<unknown>(path(workbookId),{signal:signalWithDeadline(15000,signal)});
  return validateServerDraftRead(raw,workbookId);
}
export async function executeServerDraftRequest(request:ServerDraftRequest,signal?:AbortSignal){
  const checked=validateServerDraftRequest(request);
  const raw=await apiRequest<unknown>(path(checked.workbookId)+(checked.kind==='publish'?'/publish':''),{
    method:checked.kind==='save'?'PUT':checked.kind==='publish'?'POST':'DELETE',
    signal:signalWithDeadline(30000,signal),body:checked.body,
  });
  return validateServerDraftAck(raw,checked.workbookId);
}
