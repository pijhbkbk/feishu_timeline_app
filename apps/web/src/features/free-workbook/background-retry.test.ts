import { expect,it,vi } from 'vitest';
import { createBackgroundRetry } from './background-retry';
it('keeps one current cache through repeated retries and ignores obsolete or disposed repaint callbacks',()=>{
 const callbacks:Array<()=>void>=[],dispose=vi.fn(),repaint=vi.fn(),host={};let ended=false;
 class View{uKey='WorksheetBackgroundImageExtension';parent:unknown=null;cache={decoded:new Uint8Array(1024)};constructor(_injector:unknown,notify:()=>void){callbacks.push(notify);}dispose(){dispose();}}
 const initial=new View(null,()=>{}),extensions=new Map([[initial.uKey,initial]]),retry=createBackgroundRetry(extensions,host,{},repaint,()=>ended);
 for(let i=0;i<20;i++)retry();expect(extensions.size).toBe(1);expect(extensions.get(initial.uKey)?.parent).toBe(host);expect(dispose).toHaveBeenCalledTimes(20);for(const callback of callbacks.slice(1,-1))callback();expect(repaint).not.toHaveBeenCalled();callbacks.at(-1)!();expect(repaint).toHaveBeenCalledOnce();ended=true;callbacks.at(-1)!();expect(repaint).toHaveBeenCalledOnce();
});
