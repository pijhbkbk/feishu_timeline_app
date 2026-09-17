import {createServer} from 'node:http';
import {describe, expect, it} from 'vitest';
import {drainWriters} from './graceful-shutdown';

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
});
