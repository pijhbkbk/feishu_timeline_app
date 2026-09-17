import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {validateManifest,decryptBackup,validateSignatureFloor,mergeSignatureFloors,signatureFloor} from './portable.mjs';
const m={version:1,commit:'a'.repeat(40),tree:'b'.repeat(40),architecture:'amd64',postgresMajor:14,release:'portable-test',buildTime:'2026-09-17T00:00:00Z',images:Object.fromEntries(['api','web','ops','postgres','redis','scanner'].map(k=>[k,'sha256:'+'c'.repeat(64)]))};
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
