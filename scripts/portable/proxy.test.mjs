import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {after,test} from 'node:test';
import {checkProxyHealth,createProxyServer} from './proxy.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'portable-proxy-health-'));
fs.chmodSync(root,0o700);
after(()=>fs.rmSync(root,{recursive:true}));
const origin='https://localhost:45443';
const identity={sourceCommit:'a'.repeat(40),sourceTree:'b'.repeat(40),release:'synthetic-proxy-test',buildTime:'2026-10-19T00:00:00Z'};
const healthy={status:'ok',service:'feishu-timeline-api',runtimeCommit:identity.sourceCommit,...identity};
function certificate(name,host) {
  const keyFile=path.join(root,name+'.key'),certFile=path.join(root,name+'.crt');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-sha256','-days','1','-nodes','-keyout',keyFile,'-out',certFile,'-subj','/CN='+host,'-addext','subjectAltName=DNS:'+host],{stdio:'ignore',timeout:10000});
  fs.chmodSync(keyFile,0o600);
  return {key:fs.readFileSync(keyFile),cert:fs.readFileSync(certFile),keyFile,certFile};
}
// Ephemeral synthetic keys remain in the private test directory and are never
// fixtures, console output, real-instance inputs, or part of the software pack.
const tls=certificate('localhost','localhost'),otherTls=certificate('other','wrong.invalid');
async function listen(server) {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return server.address().port;
}
async function close(server) {
  server.closeAllConnections?.();
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}
async function fixture(handler,run,options={}) {
  const upstream=http.createServer(handler);const upstreamPort=await listen(upstream);
  const proxy=createProxyServer({origin,cert:options.cert??tls.cert,key:options.key??tls.key,
    upstreamAddress:()=>({hostname:'127.0.0.1',port:upstreamPort})});
  const port=await listen(proxy);
  try {await run({port,upstream});} finally {await close(proxy);await close(upstream);}
}
const body=value=>(_request,response)=>{response.setHeader('Content-Type','application/json');response.end(JSON.stringify(value));};
const probe=(port,overrides={})=>checkProxyHealth({origin,ca:tls.cert,identity,port,...overrides});
const fails=action=>assert.rejects(action,error=>error.message==='Proxy health check failed');

test('TLS probe reaches the proxy API route with its external Host and exact identity',async()=>{
  let calls=0;
  await fixture((request,response)=>{
    calls++;assert.equal(request.url,'/api/health');assert.equal(request.headers.host,'localhost:45443');
    body(healthy)(request,response);
  },async({port})=>{await probe(port);assert.equal(calls,1);});
});
test('wrong CA, hostname, absent trust and external Host fail closed',async()=>{
  await fixture(body(healthy),async({port})=>{
    await fails(()=>probe(port,{ca:otherTls.cert}));
    await fails(()=>probe(port,{ca:undefined}));
    await fails(()=>probe(port,{origin:'https://localhost:45444'}));
  });
  await fixture(body(healthy),({port})=>fails(()=>probe(port,{ca:otherTls.cert})),otherTls);
});
test('upstream non-success and connection failures cannot report proxy health',async()=>{
  await fixture((_request,response)=>{response.writeHead(503);response.end('SYNTHETIC_PRIVATE_ERROR');},({port})=>fails(()=>probe(port)));
  await fixture(body(healthy),async({port,upstream})=>{
    await close(upstream);
    await fails(()=>probe(port));
    // Reopen only this test server so the fixture can close it uniformly.
    await listen(upstream);
  });
});
test('missing or wrong API identity is rejected even when HTTP is 200',async()=>{
  for(const value of [{}, {...healthy,status:'error'},{...healthy,service:'other'},
    ...['sourceCommit','sourceTree','release','buildTime','runtimeCommit'].map(key=>({...healthy,[key]:'wrong'})),
    ...['sourceCommit','sourceTree','release','buildTime'].map(key=>{const value={...healthy};delete value[key];return value;})]) {
    await fixture(body(value),({port})=>fails(()=>probe(port)));
  }
});
test('malformed, oversized headers/body and interrupted bodies are rejected without echo',async()=>{
  const marker='SYNTHETIC_PRIVATE_ERROR';
  const handlers=[
    (_request,response)=>response.end('{'+marker),
    (_request,response)=>response.end(JSON.stringify({...healthy,padding:marker.repeat(1000)})),
    (_request,response)=>{response.setHeader('X-Oversized',marker.repeat(1000));response.end(JSON.stringify(healthy));},
    (_request,response)=>{response.writeHead(200,{'Content-Length':'1000'});response.flushHeaders();response.write('{');setImmediate(()=>response.destroy());},
  ];
  for(const handler of handlers)await fixture(handler,({port})=>fails(()=>probe(port)));
});
test('total deadline bounds a continuous slow body',async()=>{
  await fixture((_request,response)=>{
    response.writeHead(200);response.write('{');
    const timer=setInterval(()=>response.write(' '),25);response.on('close',()=>clearInterval(timer));
  },async({port})=>{
    const start=Date.now();await fails(()=>probe(port));
    assert.ok(Date.now()-start<5000,'total deadline must finish before Docker health timeout');
  });
});
test('total deadline also bounds a TLS handshake that never completes',async()=>{
  const sockets=new Set();const server=net.createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
  const port=await listen(server);
  try {const start=Date.now();await fails(()=>probe(port));assert.ok(Date.now()-start<5000);} finally {for(const socket of sockets)socket.destroy();await close(server);}
});
test('health CLI reports only a fixed failure when its instance CA is unavailable',()=>{
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('./proxy.mjs',import.meta.url)),'--healthcheck'],{
    env:{...process.env,PUBLIC_ORIGIN:'SYNTHETIC_PRIVATE_ERROR'},encoding:'utf8',timeout:6000,maxBuffer:1024,
  });
  assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr,'Proxy health check failed\n');
});
test('init generates an explicit proxy TLS healthcheck and only public expected identity',()=>{
  const packageDir=path.join(root,'package'),bin=path.join(root,'bin'),instance=path.join(root,'instance');
  fs.mkdirSync(packageDir);fs.mkdirSync(bin);
  const manifest={version:1,commit:identity.sourceCommit,tree:identity.sourceTree,release:identity.release,buildTime:identity.buildTime,
    architecture:'amd64',postgresMajor:14,images:Object.fromEntries(['api','web','ops','postgres','redis','scanner'].map(name=>[name,'sha256:'+'c'.repeat(64)])),files:{}};
  for(const name of ['portable.mjs','data.mjs','proxy.mjs','tunnel.mjs','THIRD_PARTY_NOTICES','source.tar','images.tar']) {
    const content=Buffer.from('synthetic software '+name);fs.writeFileSync(path.join(packageDir,name),content);
    manifest.files[name]=crypto.createHash('sha256').update(content).digest('hex');
  }
  fs.writeFileSync(path.join(packageDir,'manifest.json'),JSON.stringify(manifest));
  const metadata={Os:'linux',Architecture:'amd64',Config:{Labels:{'org.opencontainers.image.revision':manifest.commit,'com.feishu-timeline.source-tree':manifest.tree,'org.opencontainers.image.version':manifest.release,'org.opencontainers.image.created':manifest.buildTime}}};
  fs.writeFileSync(path.join(bin,'docker'),'#!'+process.execPath+'\n'+
    `const args=process.argv.slice(2);if(args[0]==='load'){}else if(args[0]==='image'&&args[1]==='inspect'){process.stdout.write(${JSON.stringify(JSON.stringify([metadata]))});}else if(args[0]==='run'&&args.slice(-2).join(' ')==='postgres --version'){process.stdout.write('postgres (PostgreSQL) 14.24');}else{process.exitCode=1;}\n`,{mode:0o700});
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('./portable.mjs',import.meta.url)),'init',packageDir,instance,origin,tls.certFile,tls.keyFile],{
    env:{...process.env,PATH:bin+path.delimiter+process.env.PATH},encoding:'utf8',timeout:10000,maxBuffer:1024,
  });
  assert.equal(result.status,0);assert.equal(result.stderr,'');
  const proxy=JSON.parse(fs.readFileSync(path.join(instance,'compose.json'))).services.proxy;
  assert.equal(proxy.mem_limit,'512m');
  assert.deepEqual(proxy.healthcheck,{test:['CMD','node','/portable/proxy.mjs','--healthcheck'],interval:'15s',timeout:'5s',retries:10,start_period:'20s'});
  assert.deepEqual(proxy.environment,{PUBLIC_ORIGIN:origin,EXPECTED_SOURCE_COMMIT:identity.sourceCommit,EXPECTED_SOURCE_TREE:identity.sourceTree,EXPECTED_RELEASE:identity.release,EXPECTED_BUILD_TIME:identity.buildTime});
  assert.ok(proxy.volumes.includes(path.join(instance,'tls.crt')+':/run/tls.crt:ro'));
});

test('tunnel bounds active relays, waits briefly for refresh cleanup, and rejects excess peers',async t=>{
  // Keep the generated Unix control socket within the runtime's 95-byte bound
  // even when macOS's per-user os.tmpdir() is a much longer path.
  const short=fs.mkdtempSync('/tmp/tlp-proxy-test-');t.after(()=>fs.rmSync(short,{recursive:true}));
  const bin=path.join(short,'bin'),instance=path.join(short,'i'),events=path.join(short,'relay-events');
  fs.mkdirSync(bin);fs.mkdirSync(instance,{mode:0o700});fs.writeFileSync(events,'');
  const reservation=net.createServer();const port=await listen(reservation);await close(reservation);
  const name='timeline-portable-0123456789ab',image='sha256:'+'c'.repeat(64);
  fs.writeFileSync(path.join(instance,'instance.json'),JSON.stringify({name,origin:'https://localhost:'+port,software:{images:{api:image}}}));
  // Fake Docker only exercises admission and delayed process exit. TLS and
  // the actual image's relay memory/cleanup are separately verified in Docker.
  const metadata={Image:image,Config:{Labels:{'com.timeline.portable.instance':name}},State:{Running:true}};
  fs.writeFileSync(path.join(bin,'docker'),'#!'+process.execPath+'\n'+
    `const fs=require('node:fs');const a=process.argv.slice(2);if(a[0]==='inspect'){process.stdout.write(${JSON.stringify(JSON.stringify([metadata]))});}else if(a[0]==='exec'&&a[1]==='-i'&&a[2]===${JSON.stringify(name+'-proxy-1')}&&a[3]==='node'&&a[4]==='-e'){fs.appendFileSync(${JSON.stringify(events)},'start\\n');process.stdin.on('data',b=>process.stdout.write(b));process.stdin.on('end',()=>setTimeout(()=>{fs.appendFileSync(${JSON.stringify(events)},'end\\n');process.exit(0);},150));}else{process.exitCode=1;}\n`,{mode:0o700});
  const env={...process.env,PATH:bin+path.delimiter+process.env.PATH};
  const cli=action=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[fileURLToPath(new URL('./tunnel.mjs',import.meta.url)),action,instance],{env,stdio:['ignore','pipe','pipe']});
    let bytes=0;const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Synthetic tunnel CLI timeout'));},10000);
    for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{bytes+=chunk.length;if(bytes>16384)child.kill('SIGKILL');});
    child.on('error',reject);child.on('close',code=>{clearTimeout(timer);if(code===0)resolve();else reject(new Error('Synthetic tunnel CLI failed'));});
  });
  const sockets=[];
  const open=()=>new Promise((resolve,reject)=>{
    const socket=net.createConnection({host:'127.0.0.1',port});sockets.push(socket);socket.on('error',()=>{});
    socket.once('error',reject);socket.once('connect',()=>resolve(socket));
  });
  const echo=socket=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Synthetic relay echo timeout')),3000);
    socket.once('data',chunk=>{clearTimeout(timer);assert.equal(chunk.toString(),'ping');resolve();});socket.write('ping');
  });
  const closed=socket=>new Promise((resolve,reject)=>{
    if(socket.destroyed){resolve();return;}
    const timer=setTimeout(()=>reject(new Error('Excess peer did not close')),3000);
    socket.once('close',()=>{clearTimeout(timer);resolve();});
  });
  await cli('start');
  try {
    const active=[];for(let i=0;i<8;i++){const socket=await open();await echo(socket);active.push(socket);}
    const replacement=await open();const reply=echo(replacement);active[0].destroy();await reply;active[0]=replacement;
    const pending=[];for(let i=0;i<8;i++)pending.push(await open());
    const excess=await open();await closed(excess);await Promise.all(pending.map(closed));
    for(const socket of active)await echo(socket);
  } finally {
    for(const socket of sockets)socket.destroy();await cli('stop');
  }
  await new Promise(resolve=>setTimeout(resolve,400));
  let active=0,peak=0;for(const event of fs.readFileSync(events,'utf8').trim().split('\n')){active+=event==='start'?1:-1;peak=Math.max(peak,active);assert.ok(active>=0);}
  assert.equal(peak,8);assert.equal(active,0);
});
