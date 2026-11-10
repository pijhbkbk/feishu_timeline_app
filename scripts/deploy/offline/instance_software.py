"""Fixed R30 joint software readback used by new instance configuration.

Derived from the independently reviewed current joint installer validation.
No old preview inputs, build view, data restore or service state is consumed.
"""
from pathlib import Path
import datetime, hashlib, json, os, posixpath, re, stat
TARGET = ART = NODE = None
NODE_SHA = '9fbdfa827e8827fe757d063f791df12f94092a4e7f0d32df758b2799114311e5'

def need(v,c):
 if not v:raise RuntimeError('CHECK_'+c)

def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()

def sha(b):return hashlib.sha256(b).hexdigest()

def packed(v):return json.dumps(v,sort_keys=True,separators=(',',':')).encode()

def canonical(p):need(p.resolve()==p,'CANONICAL_PATH')

def read(p,limit=8*1024**2,owner=1100):
 canonical(p);s=p.lstat();need(stat.S_ISREG(s.st_mode) and s.st_uid==owner and not s.st_mode&0o022 and 0<=s.st_size<=limit,'PUBLIC_FILE_META')
 fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  a=os.fstat(fd);raw=b''
  while len(raw)<=limit:
   x=os.read(fd,min(1024**2,limit+1-len(raw)))
   if not x:break
   raw+=x
  z=os.fstat(fd);sig=lambda t:(t.st_dev,t.st_ino,t.st_size,t.st_mtime_ns,t.st_ctime_ns)
  need(sig(s)==sig(a)==sig(z)==sig(p.lstat()) and len(raw)==s.st_size,'PUBLIC_READ_CHANGED');return raw
 finally:os.close(fd)

def pinned(p,h,limit=8*1024**2):
 raw=read(p,limit);need(sha(raw)==h,'PUBLIC_SHA');return json.loads(raw)

def filehash(p,size,guard=lambda:None):
 canonical(p);s=p.lstat();need(stat.S_ISREG(s.st_mode) and s.st_uid==1100 and s.st_size==size and size<=256*1024**2,'SOURCE_FILE_META')
 h=hashlib.sha256();fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  a=os.fstat(fd);n=0
  while True:
   guard();x=os.read(fd,1024**2)
   if not x:break
   n+=len(x);need(n<=size,'SOURCE_SIZE');h.update(x)
  z=os.fstat(fd);sig=lambda t:(t.st_dev,t.st_ino,t.st_size,t.st_mtime_ns,t.st_ctime_ns)
  need(n==size and sig(s)==sig(a)==sig(z)==sig(p.lstat()),'SOURCE_CHANGED');return h.hexdigest()
 finally:os.close(fd)

def syncdir(p):
 fd=os.open(p,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(fd)
 finally:os.close(fd)

def write(p,value):
 raw=packed(value)+b'\n';need(len(raw)<=8*1024**2,'RECEIPT_BOUND')
 with p.open('xb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
 syncdir(p.parent);return sha(raw)

def check_build(b,plan):
 need(b.get('kind')=='R29_READONLY_NATIVE_DEPENDENCY_REUSE_BUILD_V1' and b.get('status')=='COMPILED_VERIFIED_RUNTIME_ASSEMBLY_PENDING' and b.get('exitCode')==0 and b.get('identity')==plan['identity'] and b.get('pinsSha256')==plan['buildPinsSha256'],'BUILD_STATUS')
 need(len(b['commands'])==5 and {r['name'] for r in b['commands']}=={'identity-api','identity-web','shared-build','api-build','web-build'} and all(r['exitCode']==0 for r in b['commands']),'FIVE_BUILD_STAGES')
 need(len(b['verificationCommands'])==3 and {r['name'] for r in b['verificationCommands']}=={'tool-and-resolution-check','compiled-api-identity','compiled-web-identity'} and all(r['exitCode']==0 for r in b['verificationCommands']),'BUILD_VERIFICATIONS')
 need(b.get('dependencyPrePostEqual') is True and b.get('baselineReceiptSha256')=='c8b0146942640ed096ae269136596bc97fee8860532648bf71d90b8121f0b2d8' and b.get('dependencyIndexSha256')=='318d7a11342a535c41d5105efd0ff5f3abae2b39a4bee40e0449bfec0ea6e9d5','DEPENDENCY_BASELINE')
 need(all(all(b['compiledIdentityReadback'][role].get(k)==v for k,v in plan['identity'].items()) for role in ('api','web')),'COMPILED_IDENTITY')

def validate_rows(rows,plan):
 need(len(rows)==plan['entryCount'] and sha(packed(rows))==plan['selectionSha256'],'EXACT_SELECTION')
 dirs={''}
 for rel,row in rows.items():
  need(isinstance(rel,str) and not rel.startswith('/') and '\\' not in rel and all(x not in ('','.','..') for x in rel.split('/')),'RELATIVE_PATH')
  p=Path(rel).parent
  while str(p)!='.':dirs.add(p.as_posix());p=p.parent
 need(not any(p in rows for p in dirs),'FILE_PARENT_OVERLAP')
 for rel,row in rows.items():
  if 'symlink'in row:
   t=posixpath.normpath(posixpath.join(posixpath.dirname(rel),row['symlink']))
   need(not row['symlink'].startswith('/') and not t.startswith(('../','/')) and (t in rows or t in dirs or row['dangling'] is True),'RELATIVE_LINK_CLOSURE')
  else:need(type(row['bytes'])is int and 0<=row['bytes']<=256*1024**2 and re.fullmatch('[a-f0-9]{64}',row['sha256']),'FILE_ROW')
 need(sum(x.get('bytes',0) for x in rows.values())==plan['regularBytes'],'EXACT_BYTE_TOTAL');return dirs

def installed(plan,manifest_sha,copy_sha,full=True):
 need(manifest_sha=='c6b3f29ca19eca0111e1127d1c4e07e1f4d8d2b142893ef8f0a1ca15056db8a2' and copy_sha=='cc59aa924afefbd7101ca60eda0481de5c236400ab5029b7a2b9ccbf9b8a107c','EXACT_JOINT_EXTERNAL_PINS')
 manifest=pinned(TARGET/'application-manifest.json',manifest_sha);result=pinned(TARGET/'assembly-result.json',copy_sha,65536)
 need(manifest['identity']==plan['identity'] and result['status']=='APPLICATION_ASSEMBLED_AND_VERIFIED_NOT_STARTED' and result['identity']==plan['identity'] and result['target']==str(TARGET) and result['finalManifestSha256']==manifest_sha and result['readback']['allHashesModesOwnersAndLinksReadBack'] is True,'ACTUAL_JOINT_APPLICATION')
 rows=manifest['entries'];selected={k:{a:b for a,b in v.items() if a!='mode'} for k,v in rows.items()};validate_rows(selected,plan)
 for rel,row in rows.items():
  p=ART/rel;s=p.lstat();need(s.st_uid==s.st_gid==1100,'TARGET_OWNER')
  if 'symlink'in row:need(stat.S_ISLNK(s.st_mode) and os.readlink(p)==row['symlink'],'TARGET_LINK')
  elif full:need(s.st_nlink==1 and stat.S_IMODE(s.st_mode)==row['mode'] and filehash(p,row['bytes'])==row['sha256'],'TARGET_FILE')
 rr=pinned(TARGET/'runtime-assembly-result.json','5ee49d4eacf651ef3584fb377bab083bd24ac1ac537d05f2f4103104c70685d1',65536)
 rt=pinned(TARGET/'runtime-manifest.json','3da9be29b8d38878d4fb660d90d3fdc2f2490ef17813b723b35dc500b7ed81fd')
 need(rr['status']=='RUNTIME_ASSEMBLED_AND_VERIFIED_NOT_EXECUTED' and rr['applicationAssemblyResultSha256']==copy_sha and rr['identity']==plan['identity'] and rr['runtimeSelectionSha256']=='3da9be29b8d38878d4fb660d90d3fdc2f2490ef17813b723b35dc500b7ed81fd' and rt['target']==str(TARGET/'runtime'),'ACTUAL_JOINT_RUNTIME')
 for rel,row in rt['entries'].items():
  p=TARGET/'runtime'/rel;s=p.lstat();need(s.st_uid==s.st_gid==1100,'RUNTIME_OWNER')
  if 'symlink'in row:need(stat.S_ISLNK(s.st_mode) and os.readlink(p)==row['symlink'],'RUNTIME_LINK')
  elif full:need(s.st_nlink==1 and stat.S_IMODE(s.st_mode)==row['mode'] and filehash(p,row['bytes'])==row['sha256'],'RUNTIME_FILE')
 b=pinned(TARGET/'build-receipt.json',plan['sourceIndexes']['reuse-build-receipt.json'],65536);check_build(b,plan)
 need(filehash(NODE,NODE.stat().st_size)==NODE_SHA,'JOINT_NODE_PIN')
 return b
