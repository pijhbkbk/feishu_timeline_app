import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateManifest,decryptBackup,validateSignatureFloor,mergeSignatureFloors,signatureFloor,compareFingerprints,softwareSourcePaths,safeStatusRows} from './portable.mjs';
const m={version:1,commit:'a'.repeat(40),tree:'b'.repeat(40),architecture:'amd64',postgresMajor:14,release:'portable-test',buildTime:'2026-09-17T00:00:00Z',images:Object.fromEntries(['api','web','ops','postgres','redis','scanner'].map(k=>[k,'sha256:'+'c'.repeat(64)]))};
const statusRow={Name:'timeline-portable-0123456789ab-redis-1',Service:'redis',State:'running',Health:'',ExitCode:0};
const syntheticPrivate='SYNTHETIC_STATUS_SECRET_NOT_REAL';
test('status accepts empty, array and JSON-lines output with only the five public fields',()=>{
  const privateRow={...statusRow,Command:'redis-server --requirepass '+syntheticPrivate,Labels:{private:syntheticPrivate},Env:[syntheticPrivate],Error:syntheticPrivate,FuturePrivateField:syntheticPrivate};
  for(const raw of [JSON.stringify([privateRow]),JSON.stringify(privateRow)+'\n']) {
    const rows=safeStatusRows(Buffer.from(raw));assert.deepEqual(rows,[statusRow]);
    assert.equal(JSON.stringify(rows).includes(syntheticPrivate),false);
  }
  assert.deepEqual(safeStatusRows(''),[]);assert.deepEqual(safeStatusRows('[]\n'),[]);
  assert.deepEqual(safeStatusRows(JSON.stringify(privateRow)+'\n'+JSON.stringify({...privateRow,State:'exited',ExitCode:1})),[statusRow,{...statusRow,State:'exited',ExitCode:1}]);
});
test('status parse, shape, field and resource failures never repeat private input',()=>{
  const invalid=[syntheticPrivate,'{"Command":"'+syntheticPrivate+'",','null','[null]',JSON.stringify([{...statusRow,Name:{private:syntheticPrivate}}]),JSON.stringify([{...statusRow,Service:syntheticPrivate+'\n'}]),JSON.stringify([{...statusRow,State:syntheticPrivate}]),JSON.stringify([{...statusRow,Health:{private:syntheticPrivate}}]),JSON.stringify([{...statusRow,ExitCode:syntheticPrivate}]),JSON.stringify([{...statusRow,ExitCode:256}]),JSON.stringify(Array(65).fill(statusRow)),' '.repeat(1024*1024+1)];
  for(const raw of invalid)assert.throws(()=>safeStatusRows(raw),error=>error.message==='Compose status response rejected'&&!error.message.includes(syntheticPrivate));
  assert.equal(safeStatusRows(JSON.stringify(Array(64).fill(statusRow))).length,64);
});
test('status CLI omits synthetic credentials and sanitizes malformed Docker output',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'portable-status-'));fs.chmodSync(root,0o700);
  const bin=path.join(root,'bin');fs.mkdirSync(bin,{mode:0o700});
  const response=path.join(root,'response.json');
  // This is a fake Docker executable; no real containers, private configs or credentials are read.
  fs.writeFileSync(path.join(bin,'docker'),'#!'+process.execPath+'\n'+`const fs=require('node:fs');const args=process.argv.slice(2);if(args[0]==='image'&&args[1]==='inspect'){process.stdout.write('[{}]');}else if(args[0]==='compose'&&args.slice(-3).join(' ')==='ps --format json'){process.stdout.write(fs.readFileSync(${JSON.stringify(response)}));}else{process.stderr.write(${JSON.stringify(syntheticPrivate)});process.exitCode=1;}\n`,{mode:0o700});
  fs.writeFileSync(path.join(root,'instance.json'),JSON.stringify({name:'timeline-portable-0123456789ab',origin:'https://localhost:3449',software:m}),{mode:0o600});
  const run=()=>spawnSync(process.execPath,[fileURLToPath(new URL('./portable.mjs',import.meta.url)),'status',root],{env:{...process.env,PATH:bin+path.delimiter+process.env.PATH},encoding:'utf8',timeout:10000,maxBuffer:1024*1024});
  try {
    fs.writeFileSync(response,JSON.stringify({...statusRow,Command:'redis-server --requirepass '+syntheticPrivate,Env:[syntheticPrivate]}),{mode:0o600});
    const success=run();assert.equal(success.status,0);assert.deepEqual(JSON.parse(success.stdout),[statusRow]);assert.equal(success.stderr,'');assert.equal((success.stdout+success.stderr).includes(syntheticPrivate),false);assert.equal(fs.existsSync(path.join(root,'operation.lock')),false);
    fs.writeFileSync(response,'{"Command":"'+syntheticPrivate+'",');
    const failure=run();assert.equal(failure.status,1);assert.equal(failure.stdout,'');assert.equal(failure.stderr.trim(),'Compose status response rejected');assert.equal((failure.stdout+failure.stderr).includes(syntheticPrivate),false);assert.equal(fs.existsSync(path.join(root,'operation.lock')),false);
    fs.writeFileSync(response,'x'.repeat(1024*1024+1));
    const oversized=run();assert.equal(oversized.status,1);assert.equal(oversized.stdout,'');assert.equal(oversized.stderr.trim(),'docker compose failed; no credential-bearing output printed');assert.equal(fs.existsSync(path.join(root,'operation.lock')),false);
  } finally {fs.rmSync(root,{recursive:true});}
});
test('schema comparison accepts only the approved directed pair and preserves table and sequence checks',()=>{
  const source={tables:{example:{count:1,sha256:'a'.repeat(64)}},sequences:{example_id_seq:'1|t'},schemaSha256:'3f933e582eab518c24e308cb9991e1f5fab16c310eee10f041e38746cb76b4c0'};
  const restored={...source,schemaSha256:'175721348d4d09345618dcec49699b70d2cc13ee7298e3c78bfd6ebdc9fd52c6'};
  assert.doesNotThrow(()=>compareFingerprints(source,source));
  assert.doesNotThrow(()=>compareFingerprints(source,restored));
  assert.throws(()=>compareFingerprints(restored,source),/schema fingerprint differs/);
  assert.throws(()=>compareFingerprints(source,{...restored,schemaSha256:'d'.repeat(64)}),/schema fingerprint differs/);
  assert.throws(()=>compareFingerprints({...source,schemaSha256:'e'.repeat(64)},restored),/schema fingerprint differs/);
  assert.throws(()=>compareFingerprints(source,{...restored,tables:{example:{count:1,sha256:'b'.repeat(64)}}}),/table or sequence fingerprint differs/);
  assert.throws(()=>compareFingerprints(source,{...restored,tables:{...source.tables,extra:{count:0,sha256:'c'.repeat(64)}}}),/table or sequence fingerprint differs/);
  assert.throws(()=>compareFingerprints(source,{...restored,sequences:{example_id_seq:'2|t'}}),/table or sequence fingerprint differs/);
});
test('manifest rejects mutable or incomplete images and database major changes',()=>{
  assert.equal(validateManifest(m),m);
  assert.throws(()=>validateManifest({...m,images:{...m.images,api:'app:latest'}}));
  const {scanner:_,...missing}=m.images;assert.throws(()=>validateManifest({...m,images:missing}));
  assert.throws(()=>validateManifest({...m,postgresMajor:16}));
});
test('encrypted restoration rejects wrong keys, tampering and truncation before interpretation',()=>{
  const key=crypto.randomBytes(32);const nonce=crypto.randomBytes(12);const c=crypto.createCipheriv('aes-256-gcm',key,nonce);c.setAAD(Buffer.from('timeline-portable-backup-v1'));
  const enc=Buffer.concat([c.update(JSON.stringify({synthetic:true})),c.final()]);
  const raw=Buffer.concat([Buffer.from('TLPBK001'),nonce,c.getAuthTag(),enc]);
  assert.deepEqual(decryptBackup(raw,key),{synthetic:true});
  assert.throws(()=>decryptBackup(raw,crypto.randomBytes(32)));
  const corrupt=Buffer.from(raw);corrupt[corrupt.length-1]^=1;assert.throws(()=>decryptBackup(corrupt,key));
  assert.throws(()=>decryptBackup(raw.subarray(0,raw.length-1),key));
});
test('signature restoration carries exact version floors without lowering existing minima',()=>{
  const source={'bytecode.cvd':339,'daily.cvd':28125,'main.cvd':63};
  const local={'bytecode.cvd':338,'daily.cvd':28126,'main.cvd':62};
  assert.deepEqual(mergeSignatureFloors(source,local),{'bytecode.cvd':339,'daily.cvd':28126,'main.cvd':63});
  assert.deepEqual(mergeSignatureFloors(),{'bytecode.cvd':0,'daily.cvd':0,'main.cvd':0});
  for(const value of [undefined,null,[],{}, {...source,'daily.cvd':-1},{...source,'daily.cvd':1.5},{...source,'daily.cvd':Number.MAX_SAFE_INTEGER+1},{...source,'daily.cvd':'28125'},{...source,other:1}])assert.throws(()=>validateSignatureFloor(value));
  const {['daily.cvd']:_,...missing}=source;assert.throws(()=>validateSignatureFloor(missing));
});
test('missing signature metadata differs from malformed files and dangling links',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'portable-signature-floor-'));fs.chmodSync(root,0o700);
  const floor=path.join(root,'signature-floor.json'),receipt=path.join(root,'signature-receipt.json');
  const minimum={'bytecode.cvd':339,'daily.cvd':28125,'main.cvd':63};
  try{
    assert.deepEqual(signatureFloor({root}),mergeSignatureFloors());
    fs.writeFileSync(floor,JSON.stringify(minimum),{mode:0o600});
    fs.writeFileSync(receipt,JSON.stringify({files:Object.entries({...minimum,'daily.cvd':28126}).map(([name,version])=>({name,version}))}),{mode:0o600});
    assert.equal(signatureFloor({root})['daily.cvd'],28126);
    fs.unlinkSync(receipt);fs.symlinkSync(path.join(root,'absent'),receipt);assert.throws(()=>signatureFloor({root}));
    fs.unlinkSync(receipt);fs.unlinkSync(floor);fs.symlinkSync(path.join(root,'absent'),floor);assert.throws(()=>signatureFloor({root}));
    fs.unlinkSync(floor);fs.writeFileSync(receipt,JSON.stringify({files:[{name:'main.cvd',version:63}]}),{mode:0o600});assert.throws(()=>signatureFloor({root}));
  }finally{fs.rmSync(root,{recursive:true});}
});

test('software source archive includes build inputs and generic instructions, excludes account evidence',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'portable-source-scope-'));
  const git=(...args)=>execFileSync('git',['-C',root,...args]);
  try {
    git('init','--quiet');
    for(const item of softwareSourcePaths) {
      const file=['apps','packages','patches','deploy','scripts'].includes(item)?path.join(item,'synthetic.txt'):item;
      fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),'build source');
    }
    fs.mkdirSync(path.join(root,'docs/acceptance'),{recursive:true});
    fs.writeFileSync(path.join(root,'docs/acceptance/private-account.json'),'synthetic-private-record');
    fs.mkdirSync(path.join(root,'reports'));fs.writeFileSync(path.join(root,'reports/account.json'),'synthetic-private-record');
    git('add','--',...softwareSourcePaths,'docs/acceptance/private-account.json','reports/account.json');
    git('-c','user.name=Archive Test','-c','user.email=archive@example.invalid','commit','--quiet','-m','synthetic archive fixture');
    const archive=git('archive','HEAD','--',...softwareSourcePaths);
    const listing=execFileSync('tar',['-tf','-'],{input:archive}).toString();
    assert.match(listing,/apps\/synthetic.txt/);assert.match(listing,/patches\/synthetic.txt/);assert.match(listing,/docs\/NATIVE_ACCOUNT_OPERATIONS.md/);
    assert.doesNotMatch(listing,/acceptance|reports|private-account/);
    assert.equal(archive.includes(Buffer.from('synthetic-private-record')),false);
  } finally { fs.rmSync(root,{recursive:true}); }
});
