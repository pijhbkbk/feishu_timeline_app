import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import {validateManifest,decryptBackup,validateSignatureFloor,mergeSignatureFloors,signatureFloor,compareFingerprints,softwareSourcePaths} from './portable.mjs';
const m={version:1,commit:'a'.repeat(40),tree:'b'.repeat(40),architecture:'amd64',postgresMajor:14,release:'portable-test',buildTime:'2026-09-17T00:00:00Z',images:Object.fromEntries(['api','web','ops','postgres','redis','scanner'].map(k=>[k,'sha256:'+'c'.repeat(64)]))};
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
      const file=['apps','packages','deploy','scripts'].includes(item)?path.join(item,'synthetic.txt'):item;
      fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),'build source');
    }
    fs.mkdirSync(path.join(root,'docs/acceptance'),{recursive:true});
    fs.writeFileSync(path.join(root,'docs/acceptance/private-account.json'),'synthetic-private-record');
    fs.mkdirSync(path.join(root,'reports'));fs.writeFileSync(path.join(root,'reports/account.json'),'synthetic-private-record');
    git('add','--',...softwareSourcePaths,'docs/acceptance/private-account.json','reports/account.json');
    git('-c','user.name=Archive Test','-c','user.email=archive@example.invalid','commit','--quiet','-m','synthetic archive fixture');
    const archive=git('archive','HEAD','--',...softwareSourcePaths);
    const listing=execFileSync('tar',['-tf','-'],{input:archive}).toString();
    assert.match(listing,/apps\/synthetic.txt/);assert.match(listing,/docs\/NATIVE_ACCOUNT_OPERATIONS.md/);
    assert.doesNotMatch(listing,/acceptance|reports|private-account/);
    assert.equal(archive.includes(Buffer.from('synthetic-private-record')),false);
  } finally { fs.rmSync(root,{recursive:true}); }
});
