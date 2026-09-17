import {createServer, request as httpRequest} from 'node:http';
import {describe, expect, it} from 'vitest';
import {from} from 'rxjs';
import {drainWriters} from './graceful-shutdown';
import {RequestDrainInterceptor} from './request-drain.interceptor';

describe('backup-compatible write drain', () => {
  it('waits for an accepted HTTP write and in-flight background work before closing storage', async () => {
    let completeHttp!: () => void;
    let accepted!: () => void;
    const seen = new Promise<void>(resolve => {accepted=resolve;});
    const server = createServer((_request,response) => {completeHttp=()=>response.end('saved');accepted();});
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();if(!address||typeof address==='string')throw new Error('Missing server');
    const request=fetch(`http://127.0.0.1:${address.port}`);
    await seen;
    let idle=false;let paused=false;let drained=false;
    const result=drainWriters(server,[{beginShutdown(){paused=true;},isShutdownIdle(){return idle;}}],1000).then(()=>{drained=true;});
    expect(paused).toBe(true);
    completeHttp();expect(await (await request).text()).toBe('saved');
    await new Promise(resolve=>setTimeout(resolve,20));expect(drained).toBe(false);
    idle=true;await result;expect(drained).toBe(true);
  });
  it('rejects a drain timeout instead of claiming a consistent backup point', async () => {
    const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    await expect(drainWriters(server,[{beginShutdown(){},isShutdownIdle(){return false;}}],20)).rejects.toThrow('timed out');
  });
  it('waits for business completion after client abort and downstream unsubscribe', async () => {
    const tracker=new RequestDrainInterceptor();
    let completeWrite!: () => void;let accepted!: () => void;let written=false;
    const admitted=new Promise<void>(resolve=>{accepted=resolve;});
    const server=createServer((_request,response)=>{
      const work=new Promise<void>(resolve=>{completeWrite=()=>{written=true;resolve();};});
      const subscription=tracker.intercept({} as never,{handle:()=>from(work)}).subscribe({complete:()=>response.end('saved')});
      response.on('close',()=>subscription.unsubscribe());
      accepted();
    });
    await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const addr=server.address();if(!addr||typeof addr==='string')throw new Error('Missing server');
    const request=httpRequest(`http://127.0.0.1:${addr.port}`,{method:'POST'});request.on('error',()=>{});request.end();await admitted;
    request.destroy();
    await new Promise(resolve=>setTimeout(resolve,20));
    let drained=false;const closing=drainWriters(server,[tracker],1000).then(()=>{drained=true;});
    await new Promise(resolve=>setTimeout(resolve,20));
    expect(tracker.isShutdownIdle()).toBe(false);expect(drained).toBe(false);expect(written).toBe(false);
    completeWrite();await closing;expect(written).toBe(true);expect(tracker.isShutdownIdle()).toBe(true);
  });
});
