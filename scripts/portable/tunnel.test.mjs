import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
test('loopback TLS works through an exec control channel while the only container network blocks public egress',{skip:!process.env.PORTABLE_API_TEST_IMAGE,timeout:60000},async()=>{
  const image=process.env.PORTABLE_API_TEST_IMAGE;assert.match(image,/^sha256:[a-f0-9]{64}$/);
  const root=fs.mkdtempSync('/private/tmp/tlp-tunnel-');fs.chmodSync(root,0o700);
  const name='timeline-portable-'+randomBytes(6).toString('hex');const port=3460;const origin='https://localhost:'+port;
  const run=(args,input)=>execFileSync('docker',args,{input,maxBuffer:1024*1024,timeout:30000,stdio:['pipe','pipe','pipe']});
  const control=mode=>execFileSync(process.execPath,[path.join(here,'tunnel.mjs'),mode,root],{timeout:15000,stdio:['ignore','pipe','pipe']});
  fs.writeFileSync(path.join(root,'instance.json'),JSON.stringify({name,origin,software:{images:{api:image}}}),{mode:0o600});
  execFileSync('openssl',['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:prime256v1','-nodes','-keyout',path.join(root,'tls.key'),'-out',path.join(root,'tls.crt'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'],{stdio:'ignore'});fs.chmodSync(path.join(root,'tls.key'),0o600);
  try{
    run(['network','create','--internal','--label','purpose=timeline-portable-tunnel-test',name]);
    const code="const h=require('node:http');for(const p of [3000,3001])h.createServer((q,r)=>{r.setHeader('content-type','application/json');r.end(JSON.stringify({synthetic:true,path:q.url}));}).listen(p,'0.0.0.0');";
    run(['run','-d','--name',name+'-target','--pull=never','--platform','linux/amd64','--network',name,'--network-alias','web','--network-alias','api','--read-only','--cap-drop=ALL','--memory','128m','--entrypoint','node',image,'-e',code]);
    run(['run','-d','--name',name+'-proxy-1','--label','com.timeline.portable.instance='+name,'--pull=never','--platform','linux/amd64','--network',name,'--read-only','--cap-drop=ALL','--memory','128m','--user',`${process.getuid()}:${process.getgid()}`,'--env','PUBLIC_ORIGIN='+origin,'--mount',`type=bind,source=${path.join(here,'proxy.mjs')},target=/portable/proxy.mjs,readonly`,'--mount',`type=bind,source=${path.join(root,'tls.crt')},target=/run/tls.crt,readonly`,'--mount',`type=bind,source=${path.join(root,'tls.key')},target=/run/tls.key,readonly`,'--entrypoint','node',image,'/portable/proxy.mjs']);
    assert.equal(JSON.parse(control('start')).ready,true);
    const value=await new Promise((resolve,reject)=>{const request=https.get(origin+'/api/probe',{family:4,ca:fs.readFileSync(path.join(root,'tls.crt'))},response=>{let raw='';response.on('data',b=>raw+=b);response.on('end',()=>{try{assert.equal(response.statusCode,200);resolve(JSON.parse(raw));}catch(error){reject(error);}});});request.on('error',reject);});
    assert.deepEqual(value,{synthetic:true,path:'/api/probe'});
    const blocked="const s=require('node:net').connect(443,'1.1.1.1');s.on('connect',()=>process.exit(1));s.on('error',()=>process.exit(0));s.setTimeout(1000,()=>{s.destroy();process.exit(0)});";
    run(['exec',name+'-proxy-1','node','-e',blocked]);
    assert.equal(JSON.parse(control('stop')).stopped,true);
    assert.equal(JSON.parse(run(['network','inspect',name]))[0].Internal,true);
    console.log(JSON.stringify({loopbackTls:true,externalTcpDenied:true,containerNetwork:'internal',globalFirewallChanged:false,root}));
  }finally{try{control('stop');}catch{}for(const suffix of ['-proxy-1','-target'])try{run(['rm','--force',name+suffix]);}catch{}try{run(['network','rm',name]);}catch{}}
});
