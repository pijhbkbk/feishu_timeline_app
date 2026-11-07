import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import {execFileSync} from 'node:child_process';
import {createProxyServer} from './proxy.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'timeline-private-proxy-'));
fs.chmodSync(dir,0o700);
try {
 execFileSync('/opt/homebrew/opt/openssl@3/bin/openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost','-keyout',path.join(dir,'key.pem'),'-out',path.join(dir,'cert.pem')],{stdio:'ignore'});
 const cert=fs.readFileSync(path.join(dir,'cert.pem')),key=fs.readFileSync(path.join(dir,'key.pem'));
 let seen;
 const upstream=http.createServer((req,res)=>{seen={headers:req.headers,url:req.url};res.setHeader('Content-Type','application/json');res.end('{"synthetic":true}');});
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 const up=upstream.address().port;
 const proxy=createProxyServer({origin:'https://localhost:18443',privateDomainEnabled:true,cert,key,upstreamAddress:()=>({hostname:'127.0.0.1',port:up})});
 await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
 const port=proxy.address().port;
 const request=(host,origin,extra={},trust=cert)=>new Promise((resolve,reject)=>{
  const r=https.get({host:'127.0.0.1',port,servername:'localhost',path:'/api/synthetic?fixture=1',ca:trust,rejectUnauthorized:true,headers:{Host:host,...(origin?{Origin:origin}:{}),...extra},agent:false},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});r.on('error',reject);
 });
 try {
  await test('private proxy preserves both exact hosts and true origins over verified TLS',async()=>{
   for(const [host,origin] of [['localhost:18443','https://localhost:18443'],['timeline.all-too-well.com','https://timeline.all-too-well.com'],['timeline.all-too-well.com:443','https://timeline.all-too-well.com']]){
    assert.equal(await request(host,origin),200);assert.equal(seen.headers.host,host);assert.equal(seen.headers.origin,origin);
   }
  });
  await test('proxy rejects unapproved hosts and suffix or port lookalikes',async()=>{
   for(const host of ['evil.test','timeline.all-too-well.com.evil.test','timeline.all-too-well.com:444','192.168.1.5','localhost:18444'])assert.equal(await request(host),400);
  });
  await test('proxy removes injected identity and forwarding headers without fabricating Origin',async()=>{
   assert.equal(await request('timeline.all-too-well.com','https://evil.test',{'X-Forwarded-Host':'evil.test','X-Forwarded-Proto':'http','X-Forwarded-For':'1.2.3.4','Forwarded':'host=evil.test','CF-Access-JWT-Assertion':'synthetic-untrusted','CF-Access-Authenticated-User-Email':'synthetic@example.invalid','X-Auth-Request-User':'fixture'}),200);
   for(const name of ['x-forwarded-host','x-forwarded-proto','x-forwarded-for','forwarded','cf-access-jwt-assertion','cf-access-authenticated-user-email','x-auth-request-user'])assert.equal(seen.headers[name],undefined);
   assert.equal(seen.headers.origin,'https://evil.test');
  });
  await test('TLS without the required CA fails instead of bypassing verification',async()=>{
   await assert.rejects(request('timeline.all-too-well.com',undefined,{},[]),/self.signed|certificate/i);
  });
  await test('private domain opt-in refuses a different fallback origin',()=>{
   assert.throws(()=>createProxyServer({origin:'https://localhost:18444',privateDomainEnabled:true,cert,key}),/Unapproved/);
  });
 } finally {await new Promise(r=>proxy.close(r));await new Promise(r=>upstream.close(r));}
} finally {fs.rmSync(dir,{recursive:true});}
