import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {test} from 'node:test';
import {validateManifest,decryptBackup} from './portable.mjs';
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
