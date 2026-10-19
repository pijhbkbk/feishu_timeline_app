import type { NextFunction, Request, Response } from 'express';
/** Only complete workbook writes accept a larger JSON body. Other API limits
 * remain unchanged; multipart images still use the admitted/scanned pipeline. */
let activeWorkbookBodies=0;
export function workbookBody(request: Request, response: Response, next: NextFunction) {
  const path=request.path;
  if (!(request.method === 'POST' && path === '/api/workbooks' || request.method === 'PUT' && /^\/api\/workbooks\/[a-f\d-]{36}$/i.test(path))) { next(); return; }
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '') || request.headers['content-encoding']) { response.status(415).json({ message:'工作簿请求须为未压缩 JSON。' }); return; }
  if(activeWorkbookBodies>=4){response.status(503).json({message:'工作簿保存请求繁忙，请稍后重试原请求。'});return;}
  activeWorkbookBodies++;let released=false;const release=()=>{if(!released){released=true;activeWorkbookBodies--;}};
  const limit=8*1024*1024; let length=0, settled=false; const chunks: Buffer[]=[];
  const timer=setTimeout(()=>fail(408,'工作簿请求读取超时。'),30000); timer.unref();
  function fail(status:number,message:string) { if(settled)return;settled=true;release();clearTimeout(timer);chunks.length=0;response.set('Connection','close').status(status).json({message});response.once('finish',()=>request.destroy()); }
  if (Number(request.headers['content-length'] ?? 0)>limit) { fail(413,'工作簿请求超过 8 MiB。');return; }
  request.on('data',(chunk:Buffer)=>{ if(settled)return;length+=chunk.length;if(length>limit)fail(413,'工作簿请求超过 8 MiB。');else chunks.push(chunk); });
  request.once('error',()=>{release();clearTimeout(timer);if(!settled){settled=true;next(new Error('工作簿请求读取失败。'));}});
  request.once('aborted',()=>{settled=true;release();clearTimeout(timer);chunks.length=0;});
  request.once('end',()=>{ if(settled)return;settled=true;release();clearTimeout(timer);try { const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,length))) as unknown;if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();request.body=body;next(); }catch{response.status(400).json({message:'工作簿 JSON 无效。'});} });
}
