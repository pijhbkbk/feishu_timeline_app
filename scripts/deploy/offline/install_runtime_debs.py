#!/usr/bin/env python3
"""Install the fixed R30 runtime payload on an explicitly bound Ubuntu ARM64 target.

No system package installation, maintainer scripts, downloads, DB or service changes.
The caller must authenticate this program, the host scope/reader and target binding
outside this program. A locally generated hash is identity, never authorization.
"""
import argparse,copy,ctypes,datetime,hashlib,io,json,os,re,resource,shutil,signal,stat,struct,subprocess,sys,tarfile,time,types
from pathlib import Path,PurePosixPath

ROOT=Path('/home/recovery')
INPUT=BASE=TARGET=OUT=None
DEBS=None
BOOT=None
CAP=24*1024**3;FLOOR=1024**3;RESERVE=320*1024**2
SELECTION_SHA='35784a08501e366fd440449a085935f751ecb0428e88ca9c34412dc35b720851'
ENTRIES_SHA='c79a86ad1c8d65536f1232e29ee07fb6931aafb88054c659cf403b430c4190ce'
BASE_SHA='3362c7eff86e69b53a4b906b1c1d1816db1bff87066632ed396bfab7f3d5c804'
BASE_ARCHIVE_SHA='594c92b6131ee17290a538b02bbcfd2067521586645a40e7b9f9b370707eb7e3'
BASE_MANIFEST_SHA='bd455649df2020d19e9ee31a197a5b8a1fdb9867b6c85b25d2f4d4fda04c5b31'
BASE_UPDATE_OVERLAY_SHA='7ce7c823871d70d0e84a5a5fe1ff162c6cbaaccb5d11525f6db826c2b489e6c1'
BASE_UPDATE_EXPECTED={
 'libsystemd0':('arm64','255.4-1ubuntu8.17','255.4-1ubuntu8.18'),
 'libudev1':('arm64','255.4-1ubuntu8.17','255.4-1ubuntu8.18'),
 'tzdata':('all','2026c-0ubuntu0.24.04.1','2026e-0ubuntu0.24.04.1')}
LOADER=Path('/usr/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1')
LOADER_SHA='390027e5f45f236bd1838bc54bf464c5ff01d260ab9f8b415ea8276641bce505'
ENV={}
base_update_binding={};base_update_file_pins={}
supplemental_update_binding=None;supplemental_file_pins={}
started=time.monotonic();commands=[];library_cache={};base_packages={};expected={};archive_entries=[];counter=0

class Refused(Exception):pass

class Deadline(Exception):pass

def need(ok,code):
 if not ok:raise Refused(code)

def sha(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()

def regular(p,limit=None,uid=None):
 s=p.lstat();need(stat.S_ISREG(s.st_mode) and s.st_nlink==1,'REGULAR_FILE_REQUIRED')
 if limit is not None:need(s.st_size<=limit,'FILE_SIZE_LIMIT')
 if uid is not None:need(s.st_uid==uid,'FILE_OWNER')
 return s

def durable(p,d):
 b=(json.dumps(d,sort_keys=True,indent=2)+'\n').encode();need(len(b)<=4*1024**2,'RECEIPT_SIZE')
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as f:f.write(b);f.flush();os.fsync(f.fileno())
 fd=os.open(p.parent,os.O_RDONLY|os.O_DIRECTORY);os.fsync(fd);os.close(fd)

def allocated(p):
 if not p.exists():return 0
 total=p.lstat().st_blocks*512
 for root,dirs,files in os.walk(p,followlinks=False):
  for name in dirs+files:total+=(Path(root)/name).lstat().st_blocks*512
 return total

def capacity(initial=False):
 free=shutil.disk_usage(ROOT).free
 need(free>=FLOOR+(RESERVE if initial else 0),'GUEST_FREE_FLOOR')
 t=allocated(TARGET);o=allocated(OUT);need(t<=256*1024**2 and o<=16*1024**2,'ALLOCATED_STOP_LINE')
 return {'guestFreeBytes':free,'payloadAllocatedBytes':t,'evidenceAllocatedBytes':o}

def limits(extract):
 resource.setrlimit(resource.RLIMIT_CORE,(0,0));resource.setrlimit(resource.RLIMIT_NOFILE,(128,128))
 resource.setrlimit(resource.RLIMIT_AS,(1024**3,1024**3));resource.setrlimit(resource.RLIMIT_CPU,(30,30))
 n=128*1024**2 if extract else 1024**2;resource.setrlimit(resource.RLIMIT_FSIZE,(n,n))

def exact_base_update(bases):
 need(isinstance(BASE_UPDATE_OVERLAY_SHA,str)and re.fullmatch('[0-9a-f]{64}',BASE_UPDATE_OVERLAY_SHA),'BASE_UPDATE_AUTHENTICATION_PENDING')
 overlay=load(INPUT/'base-update-overlay.json',BASE_UPDATE_OVERLAY_SHA,8*1024**2)
 need(overlay['kind']=='EXACT_THREE_PACKAGE_BASE_UPDATE'and overlay['status']=='ROOT_AUTHENTICATED_EXACT_UPDATE','BASE_UPDATE_STATUS')
 need(overlay['originalBaseSha256']==BASE_SHA and overlay['basePackageCount']==122 and overlay['runtimeDebCount']==20 and overlay['runtimeDebsSha256']=='906c894e2858377f7f68283e5d2e550cf04f0fd41d945d39b7665d8d1f1a1d0b','BASE_UPDATE_SCOPE')
 proofs=overlay['proofInputs'];need(3<=len(proofs)<=12 and len({x['file']for x in proofs})==len(proofs),'BASE_UPDATE_PROOFS')
 for proof in proofs:
  need(re.fullmatch('[A-Za-z0-9_.-]+',proof['file'])and isinstance(proof['sha256'],str)and re.fullmatch('[0-9a-f]{64}',proof['sha256']),'BASE_UPDATE_PROOF_PIN')
  p=INPUT/proof['file'];regular(p,32*1024**2);need(sha(p)==proof['sha256'],'BASE_UPDATE_PROOF_CHANGED')
 changes=overlay['changes'];need(len(changes)==3 and {x['package']for x in changes}==set(BASE_UPDATE_EXPECTED),'BASE_UPDATE_EXACT_THREE')
 by={x['package']:x for x in bases['packages']};need(len(by)==122,'BASE_UPDATE_ORIGINAL_COUNT');checked=0;total=0
 for change in changes:
  name=change['package'];architecture,old,new=BASE_UPDATE_EXPECTED[name];item=by[name]
  need((item['architecture'],item['version'])==(architecture,old)and(change['architecture'],change['fromVersion'],change['toVersion'])==(architecture,old,new),'BASE_UPDATE_VERSION')
  need(all(isinstance(change.get(k),str)and re.fullmatch('[0-9a-f]{64}',change[k])for k in['archiveSha256','controlSha256','installedReadbackSha256']),'BASE_UPDATE_AUTHENTICATED_PACKAGE_PINS')
  checks=change['installedFileChecks'];need(0<len(checks)<=4096,'BASE_UPDATE_FILE_CHECKS')
  for check in checks:
   p=Path(check['path']);path=str(p);need(p.is_absolute()and '..'not in p.parts,'BASE_UPDATE_FILE_PATH')
   need(path.startswith('/usr/share/zoneinfo/')if name=='tzdata'else(path.startswith('/usr/lib/aarch64-linux-gnu/libsystemd.so')or path.startswith('/lib/aarch64-linux-gnu/libsystemd.so'))if name=='libsystemd0'else(path.startswith('/usr/lib/aarch64-linux-gnu/libudev.so')or path.startswith('/lib/aarch64-linux-gnu/libudev.so')),'BASE_UPDATE_FILE_SCOPE')
   st=p.lstat();need(st.st_uid==0 and(stat.S_ISLNK(st.st_mode)or not st.st_mode&0o022),'BASE_UPDATE_FILE_OWNER_MODE')
   if check['type']=='symlink':need(stat.S_ISLNK(st.st_mode)and os.readlink(p)==check['target'],'BASE_UPDATE_SYMLINK')
   else:
    need(check['type']=='file'and stat.S_ISREG(st.st_mode)and st.st_size==check['bytes']and st.st_size<=16*1024**2 and sha(p)==check['sha256'],'BASE_UPDATE_FILE_BYTES')
    total+=st.st_size;need(total<=64*1024**2,'BASE_UPDATE_TOTAL_BYTES');base_update_file_pins[str(p.resolve(strict=True))]=check['sha256']
   checked+=1
  item['version']=new
 base_update_binding.update({'originalBaseSha256':BASE_SHA,'overlaySha256':BASE_UPDATE_OVERLAY_SHA,'proofInputs':proofs,'changedPackages':sorted(BASE_UPDATE_EXPECTED),'checkedInstalledFiles':checked,'checkedInstalledBytes':total,'unchangedBasePackageCount':119})
 return bases

def query_base(bases,readonly=False):
 fmt='${binary:Package}\t${Version}\t${Architecture}\t${db:Status-Abbrev}\n'
 argv=['/usr/bin/dpkg-query','-W','-f='+fmt]+[x['dpkgSpecifier']for x in bases['packages']]
 if readonly:
  # run() owns extraction logs under OUT, which must not exist in this mode.
  need(len(bases['packages'])==122,'READONLY_BASE_COUNT')
  q=subprocess.run(argv,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                   env=ENV,cwd=ROOT,timeout=15)
  need(q.returncode==0 and not q.stderr and len(q.stdout)<=65536,'READONLY_BASE_QUERY')
  text=q.stdout.decode()
  commands.append({'argv':argv,'exitCode':q.returncode,'stdoutBytes':len(q.stdout),
                   'stdoutSha256':hashlib.sha256(q.stdout).hexdigest(),'filesWritten':False})
 else:text=run(argv)
 rows={}
 for line in text.splitlines():
  fields=line.split('\t');need(len(fields)==4,'DPKG_FIELDS');rows[fields[0]]=fields[1:]
 for p in bases['packages']:
  key=p['package']+(':'+p['architecture']if p['architecture']!='all'else'')
  candidate=rows.get(key,rows.get(p['package']));need(candidate is not None and candidate[:2]==[p['version'],p['architecture']]and candidate[2].strip()=='ii','EXACT_BASE_PACKAGE')
  base_packages[p['package']]={'version':p['version'],'architecture':p['architecture'],'dpkgSpecifier':p['dpkgSpecifier']}
 return rows

def base_update_support(support):
 need(set(support)=={'configurationCodeSha256','dependencyReceipt'},'SUPPLEMENT_SUPPORT')
 source=INPUT/'prepare_instance.py';digest_arg(support['configurationCodeSha256'])
 info=regular(source,65536,1100)
 need(source.resolve(strict=True)==source and not info.st_mode&0o022,'SUPPLEMENT_SOURCE_METADATA')
 raw=source.read_bytes();need(hashlib.sha256(raw).hexdigest()==support['configurationCodeSha256'],'SUPPLEMENT_SOURCE_PIN')
 m=types.ModuleType('prepare_instance');m.__file__=str(source)
 exec(compile(raw,str(source),'exec'),m.__dict__)
 return m

def exact_supplemental_update(bases,binding):
 """Keep the old overlay; consume one separately pinned current update proof."""
 global supplemental_update_binding
 refs=binding.get('baseUpdate')
 if refs is None:
  need('baseUpdateSupport' not in binding,'SUPPLEMENT_WITHOUT_PROOF')
  return bases
 support=binding.get('baseUpdateSupport',{})
 m=base_update_support(support)
 dep_ref=support['dependencyReceipt']
 need(dep_ref.get('sha256')==m.DEPS_SHA,'SUPPLEMENT_HISTORY_PIN')
 dep=m.pinned(dep_ref)
 need(dep.get('status')=='NEW_PREFIX_RUNTIME_PAYLOAD_AND_ELF_VERIFIED' and
      dep.get('basePackageCount')==122 and dep.get('loader',{}).get('elfCount')==134,
      'SUPPLEMENT_HISTORY_SUCCESS')
 rows=dep['loader']['libraries'];need(len({r['path'] for r in rows})==len(rows),'SUPPLEMENT_HISTORY_SET')
 updates,evidence=m.base_update(refs,{r['path']:r for r in rows})
 for path,row in updates.items():
  p=Path(path);data=m.read(p,1024**2,owner=0);s=p.lstat()
  need(m.sha(data)==row['currentSha256'] and len(data)==row['bytes'] and
       s.st_uid==s.st_gid==0 and stat.S_IMODE(s.st_mode)==0o644,'SUPPLEMENT_CURRENT_BYTES_METADATA')
 copied=copy.deepcopy(bases)
 matches=[x for x in copied['packages'] if x['package']=='libbrotli1']
 need(len(matches)==1 and (matches[0]['architecture'],matches[0]['version'])==('arm64','1.1.0-2build2'),
      'SUPPLEMENT_ORIGINAL_VERSION')
 matches[0]['version']='1.1.0-2ubuntu0.1'
 supplemental_file_pins.update(updates)
 supplemental_update_binding={**evidence,'currentUnchangedFromOriginalBasePackageCount':118,
                              'originalThreePackageOverlayRetained':True,
                              'support':support}
 return copied

def supplemental_owner(path,names,actual_sha,metadata):
 if str(path) not in supplemental_file_pins and not any(n.split(':')[0]=='libbrotli1' for n in names):
  return
 # Same package membership must not grant its encoder or any other path.
 row=supplemental_file_pins.get(str(path))
 need(row is not None and names==['libbrotli1:arm64'] and
      actual_sha==row['currentSha256'] and metadata.st_size==row['bytes'] and
      metadata.st_uid==metadata.st_gid==0 and stat.S_IMODE(metadata.st_mode)==0o644,
      'SUPPLEMENT_EXACT_OWNER_PATH_BYTES')
 alias=Path(str(path).removesuffix('.1.0'));s=alias.lstat()
 need(alias.parent.resolve()==alias.parent and stat.S_ISLNK(s.st_mode) and
      s.st_uid==s.st_gid==0 and os.readlink(alias)==path.name and alias.resolve(strict=True)==path,
      'SUPPLEMENT_EXACT_ALIAS')

def verify_tree():
 actual={}
 for root,dirs,files in os.walk(TARGET,followlinks=False):
  for name in dirs+files:
   p=Path(root)/name;r=p.relative_to(TARGET).as_posix();s=p.lstat();need(s.st_uid==1100,'EXTRACTED_OWNER')
   if stat.S_ISDIR(s.st_mode):kind='dir'
   elif stat.S_ISLNK(s.st_mode):kind='symlink'
   elif stat.S_ISREG(s.st_mode):kind='file'
   else:raise Refused('EXTRACTED_SPECIAL_FILE')
   actual[r]=kind
   if r not in expected:need(kind=='dir'and any(n.startswith(r+'/')for n in expected),'EXTRACTED_UNEXPECTED');continue
   x=expected[r];need(kind==x['type'],'EXTRACTED_TYPE')
   if kind=='file':need(s.st_nlink==1 and s.st_size==x['bytes']and stat.S_IMODE(s.st_mode)==int(x['mode'],8)and sha(p)==x['sha256'],'EXTRACTED_FILE')
   if kind=='symlink':need(os.readlink(p)==x['target'],'EXTRACTED_LINK')
 need(all(p in actual for p,x in expected.items()if p not in['.','']),'EXTRACTED_MISSING')
 return {'regularFiles':sum(k=='file'for k in actual.values()),'symlinks':sum(k=='symlink'for k in actual.values()),'treeVerified':True}

def extract_fixed_deb(package):
 # Only hash-pinned Debian ar members are decoded; no package program is executed.
 raw=(DEBS/package['file']).read_bytes();need(len(raw)==package['bytes']and hashlib.sha256(raw).hexdigest()==package['sha256'],'DEB_CHANGED')
 need(raw[:8]==b'!<arch>\n','AR_HEADER');offset=8;parts={}
 while offset<len(raw):
  h=raw[offset:offset+60];need(len(h)==60 and h[58:]==b'`\n','AR_MEMBER_HEADER');name=h[:16].decode('ascii').strip().rstrip('/');size=int(h[48:58]);need(0<=size<=32*1024**2 and name not in parts,'AR_MEMBER_BOUND')
  b=raw[offset+60:offset+60+size];need(len(b)==size,'AR_MEMBER_TRUNCATED');parts[name]=b;offset+=60+size+(size%2)
 need(offset==len(raw) and parts.get('debian-binary')==b'2.0\n','AR_FORMAT')
 names=[n for n in parts if n.startswith('data.tar.')];need(len(names)==1,'DATA_MEMBER_COUNT');name=names[0]
 if name.endswith('.xz'):
  # liblzma5 is an earlier zstd package in the fixed selection: decode xz with its NEW bytes.
  libpath=TARGET/'usr/lib/aarch64-linux-gnu/liblzma.so.5';owner(libpath);lib=ctypes.CDLL(str(libpath.resolve()))
  S=ctypes.c_size_t;P=ctypes.c_void_p
  lib.lzma_stream_buffer_decode.argtypes=[ctypes.POINTER(ctypes.c_uint64),ctypes.c_uint32,P,P,ctypes.POINTER(S),S,P,ctypes.POINTER(S),S];lib.lzma_stream_buffer_decode.restype=ctypes.c_int
  source=ctypes.create_string_buffer(parts[name]);out=ctypes.create_string_buffer(256*1024**2);inp=S(0);outp=S(0);memory=ctypes.c_uint64(256*1024**2)
  rc=lib.lzma_stream_buffer_decode(ctypes.byref(memory),0,None,source,ctypes.byref(inp),len(parts[name]),out,ctypes.byref(outp),len(out));need(rc==0 and inp.value==len(parts[name])and outp.value<=256*1024**2,'XZ_DECODE_BOUND');data=ctypes.string_at(out,outp.value);del out,source
 elif name.endswith('.zst'):
  libpath=Path('/usr/lib/aarch64-linux-gnu/libzstd.so.1');owner(libpath);lib=ctypes.CDLL(str(libpath.resolve()))
  lib.ZSTD_decompress.argtypes=[ctypes.c_void_p,ctypes.c_size_t,ctypes.c_void_p,ctypes.c_size_t];lib.ZSTD_decompress.restype=ctypes.c_size_t
  lib.ZSTD_isError.argtypes=[ctypes.c_size_t];lib.ZSTD_isError.restype=ctypes.c_uint
  out=ctypes.create_string_buffer(256*1024**2);source=ctypes.create_string_buffer(parts[name]);size=lib.ZSTD_decompress(out,len(out),source,len(parts[name]));need(not lib.ZSTD_isError(size)and size<=256*1024**2,'ZSTD_DECODE_BOUND');data=ctypes.string_at(out,size);del out,source
 else:raise Refused('UNSUPPORTED_PINNED_DATA_COMPRESSION')
 allowed=[x for x in archive_entries if x['package']==package['package']];seen=[]
 with tarfile.open(fileobj=io.BytesIO(data),mode='r:')as archive:
  for member in archive:
   path=member.name.removeprefix('./');kind='file'if member.isfile()else'dir'if member.isdir()else'symlink'if member.issym()else'REFUSED'
   matches=[x for x in allowed if x['path']==path];need(len(matches)==1,'MEMBER_NOT_PINNED');x=matches[0]
   need(kind==x['type']and member.mode==int(x['mode'],8)and member.size==x['bytes'],'MEMBER_METADATA_CHANGED');seen.append(path)
   if path in['.','']:
    need(kind=='dir','ROOT_ENTRY_TYPE');continue
   dest=TARGET/path
   for parent in reversed(dest.parents):
    if parent==TARGET or parent.is_relative_to(TARGET):
     if parent.exists():need(not parent.is_symlink()and parent.is_dir()and parent.stat().st_uid==1100,'EXTRACTION_PARENT')
     else:parent.mkdir(mode=0o755)
   if kind=='dir':
    if dest.exists():need(not dest.is_symlink()and dest.is_dir(),'DIRECTORY_COLLISION')
    else:dest.mkdir(mode=member.mode)
   elif kind=='symlink':
    need(member.linkname==x['target']and not dest.exists()and not dest.is_symlink(),'LINK_CHANGED_OR_EXISTS');os.symlink(member.linkname,dest)
   else:
    need(not dest.exists()and not dest.is_symlink(),'FILE_EXISTS');fd=os.open(dest,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,member.mode);os.fchmod(fd,member.mode);digest=hashlib.sha256();written=0
    with os.fdopen(fd,'wb')as target,archive.extractfile(member)as source:
     for b in iter(lambda:source.read(1024*1024),b''):
      need(shutil.disk_usage(ROOT).free>=FLOOR+len(b),'GUEST_FREE_FLOOR_DURING_WRITE');target.write(b);digest.update(b);written+=len(b);need(written<=x['bytes'],'FILE_LENGTH_BOUND')
     target.flush();os.fsync(target.fileno())
    need(written==x['bytes']and digest.hexdigest()==x['sha256'],'WRITTEN_FILE_HASH')
 need(len(seen)==len(allowed)and set(seen)=={x['path']for x in allowed},'ARCHIVE_MEMBER_SET')
 fd=os.open(TARGET,os.O_DIRECTORY|os.O_RDONLY);os.fsync(fd);os.close(fd);capacity()

def alarm(*_):raise Deadline()

def run(argv,timeout=10,extract=False,extra=None,separate_stderr=False):
 global counter
 need(time.monotonic()-started<300,'TOTAL_DEADLINE');counter+=1
 log=OUT/('command-%03d.log'%counter);fd=os.open(log,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 env=dict(ENV);env.update(extra or {});p=None;pidfd=None;errfd=None;errlog=None
 record={'argv':argv,'exitCode':None,'log':log.name};commands.append(record)
 try:
  if separate_stderr:
   errlog=OUT/('command-%03d.stderr.log'%counter);errfd=os.open(errlog,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600);record['stderrLog']=errlog.name
  p=subprocess.Popen(argv,stdin=subprocess.DEVNULL,stdout=fd,stderr=errfd if separate_stderr else subprocess.STDOUT,env=env,cwd=OUT,preexec_fn=lambda:limits(extract),start_new_session=False)
  record['pid']=p.pid
  pidfd=os.pidfd_open(p.pid)
  try:rc=p.wait(timeout=min(timeout,max(0.1,300-(time.monotonic()-started))));record['exitCode']=rc
  except BaseException:
   try:signal.pidfd_send_signal(pidfd,signal.SIGTERM)
   except ProcessLookupError:pass
   try:p.wait(timeout=2)
   except subprocess.TimeoutExpired:raise Refused('CHILD_TERM_NOT_CONFIRMED')
   raise
 finally:
  if p is not None and pidfd is None:
   # No wait/poll has occurred; this child cannot have been reaped/reused here.
   try:os.kill(p.pid,signal.SIGTERM)
   except ProcessLookupError:pass
   try:p.wait(timeout=2)
   except subprocess.TimeoutExpired:pass
  if pidfd is not None:os.close(pidfd)
  os.close(fd)
  if errfd is not None:os.close(errfd)
  if errlog is not None and errlog.exists():record.update({'stderrSha256':sha(errlog),'stderrBytes':errlog.stat().st_size})
  if log.exists():record['logSha256']=sha(log);record['logBytes']=log.stat().st_size
 regular(log,1024**2);text=log.read_text(errors='strict')
 need(rc==0,'CHILD_EXIT_NONZERO');capacity()
 if separate_stderr:
  regular(errlog,1024**2);return text,errlog.read_text(errors='strict')
 return text

def parse_owner_query(candidate,text,returncode):
 # dpkg-query -S: ordinary owners and documented diversion metadata are distinct.
 need(isinstance(text,str)and len(text)<=8192,'OWNER_OUTPUT_LIMIT')
 need(returncode in[0,1],'OWNER_QUERY_EXIT')
 if returncode==1:
  need(text=='','OWNER_FAILED_QUERY_OUTPUT');return {'owners':[],'diversions':[]}
 need(text and len(text.splitlines())<=64,'OWNER_EMPTY_SUCCESS_OR_LINE_BOUND')
 package=r'[a-z0-9][a-z0-9+.-]*(?::[a-z0-9][a-z0-9-]*)?'
 names=[];diversions={}
 for line in text.splitlines():
  dm=re.fullmatch(r'diversion by ('+package+r') (from|to): (/[^\s]+)',line)
  lm=re.fullmatch(r'local diversion (from|to): (/[^\s]+)',line)
  if dm or lm:
   by=dm.group(1)if dm else None;direction=dm.group(2)if dm else lm.group(1);path=dm.group(3)if dm else lm.group(2)
   need('..'not in PurePosixPath(path).parts,'OWNER_DIVERSION_PATH')
   item=diversions.setdefault(by,{});need(direction not in item,'OWNER_DUPLICATE_DIVERSION');item[direction]=path
   continue
  m=re.fullmatch('('+package+r'(?:, '+package+r')*): (/[^\s]+)',line)
  need(m is not None,'OWNER_FORMAT');need(m.group(2)==candidate,'OWNER_WRONG_PATH');names.extend(m.group(1).split(', '))
 records=[]
 for by,pair in diversions.items():
  need(set(pair)=={'from','to'}and pair['from']!=pair['to']and candidate in pair.values(),'OWNER_DIVERSION_PAIR')
  records.append({'kind':'local'if by is None else'package','package':by,**pair,'grantsOwnership':False})
 return {'owners':names,'diversions':records}

def owner(path):
 real=path.resolve(strict=True);key=str(real)
 if key in library_cache:return library_cache[key]
 s=real.stat();need(stat.S_ISREG(s.st_mode),'ELF_LIBRARY_REGULAR')
 if real.is_relative_to(TARGET):
  r=real.relative_to(TARGET).as_posix();x=expected.get(r);need(x is not None and x['type']=='file'and sha(real)==x['sha256'],'PREFIX_LIBRARY_PIN')
  value={'path':key,'delivery':'new-prefix-20deb','package':x['package'],'sha256':x['sha256']}
 else:
  need(key.startswith('/usr/lib/')or key.startswith('/lib/'),'ELF_SYSTEM_PATH')
  # Debian merged-/usr ownership metadata may use the /lib alias for the same inode.
  candidates=[key]
  if key.startswith('/usr/lib/'):candidates.append(key[4:])
  names=[];ownership_queries=[]
  for candidate in candidates:
   if candidate!=key:need(Path(candidate).resolve(strict=True)==real,'OWNER_ALIAS_DIFFERENT_OBJECT')
   p=subprocess.run(['/usr/bin/dpkg-query','-S',candidate],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,env=ENV,timeout=5)
   need(len(p.stdout)<=8192,'OWNER_OUTPUT_LIMIT')
   parsed=parse_owner_query(candidate,p.stdout.decode(),p.returncode)
   ownership_queries.append({'query':candidate,'exitCode':p.returncode,'stdoutSha256':hashlib.sha256(p.stdout).hexdigest(),**parsed})
   if parsed['owners']:
    for name in parsed['owners']:
     parts=name.split(':');base=base_packages.get(parts[0]);need(base is not None,'SYSTEM_RUNTIME_FALLBACK_OR_UNKNOWN_OWNER')
     need(len(parts)==1 or parts[1]==base['architecture'],'OWNER_ARCHITECTURE')
    names=parsed['owners'];break  # A valid canonical owner needs no alias query.
  need(names,'SYSTEM_RUNTIME_FALLBACK_OR_UNKNOWN_OWNER')
  need(s.st_uid==0 and not s.st_mode&0o022,'BASE_LIBRARY_OWNER_MODE')
  actual_sha=sha(real)
  if any(n.split(':')[0]in BASE_UPDATE_EXPECTED for n in names):need(base_update_file_pins.get(key)==actual_sha,'UPDATED_BASE_LIBRARY_NOT_AUTHENTICATED')
  if supplemental_update_binding is not None:supplemental_owner(real,names,actual_sha,s)
  value={'path':key,'delivery':'exact-122-base','packages':sorted(set(names)),'sha256':actual_sha}
 library_cache[key]=value;return value

def elf_info(path):
 with open(path,'rb')as f:
  head=f.read(64);need(len(head)==64 and head[:6]==b'\x7fELF\x02\x01','ELF64_LITTLE_ENDIAN')
  typ,machine=struct.unpack_from('<HH',head,16);need(typ in[2,3]and machine==183,'ELF_ARM64_EXEC_OR_DYN')
  phoff=struct.unpack_from('<Q',head,32)[0];entsize,count=struct.unpack_from('<HH',head,54);need(entsize==56 and 0<count<=256,'ELF_PROGRAM_HEADERS')
  needs=0;has_interp=False;length=path.stat().st_size
  for i in range(count):
   need(phoff+i*entsize+56<=length,'ELF_PH_BOUND');f.seek(phoff+i*entsize);ph=f.read(56);pt=struct.unpack_from('<I',ph,0)[0]
   if pt==3:has_interp=True
   if pt==2:
    off=struct.unpack_from('<Q',ph,8)[0];size=struct.unpack_from('<Q',ph,32)[0];need(size<=1024**2 and off+size<=length and size%16==0,'ELF_DYNAMIC_BOUND');f.seek(off)
    for _ in range(size//16):
     tag,_value=struct.unpack('<qQ',f.read(16))
     if tag==0:break
     if tag==1:needs+=1
 return {'neededCount':needs,'hasInterpreter':has_interp,'type':typ}

def parse_loader_listing(data,debug,expected_root,root_binding,loader_binding,pid,info):
 # Pure parser: callers supply actual hash/owner bindings; no filesystem/process access.
 need(type(pid)is int and pid>0,'LOADER_ACTUAL_CHILD_PID')
 need(isinstance(data,str)and isinstance(debug,str)and len(data)<=1024**2 and len(debug)<=1024**2,'LOADER_TEXT_BOUND')
 need(root_binding.get('path')==expected_root['path']and root_binding.get('sha256')==expected_root['sha256']and root_binding.get('delivery')=='new-prefix-20deb','LOADER_ROOT_IDENTITY')
 need(loader_binding.get('path')==str(LOADER)and loader_binding.get('sha256')==LOADER_SHA and loader_binding.get('delivery')=='exact-122-base','LOADER_BINARY_IDENTITY')
 need(type(info.get('neededCount'))is int and 0<=info['neededCount']<=65536 and type(info.get('hasInterpreter'))is bool and info.get('type')in[2,3],'LOADER_ELF_METADATA')
 lines=data.splitlines();need(lines and len(lines)<=4096,'LOADER_LINE_COUNT')
 need('not found'not in data,'UNRESOLVED_ELF')
 if lines==['\tstatically linked']:
  need(info['neededCount']==0 and not info['hasInterpreter'],'UNEXPECTED_STATIC_ELF')
  return {'namedPaths':[],'anonymousRoot':None,'vdsoRows':0,'staticWithoutNeeded':True}
 anonymous=[(i,re.fullmatch(r'\t \(0x([0-9a-f]{16})\)',line))for i,line in enumerate(lines)]
 anonymous=[(i,m)for i,m in anonymous if m is not None]
 need(len(anonymous)<=1 and(not anonymous or anonymous[0][0]==0),'LOADER_SINGLE_FIRST_ROOT_ROW')
 proof=None
 if anonymous:
  address=int(anonymous[0][1].group(1),16);need(address>0,'LOADER_ROOT_ADDRESS')
  prefix=r'\s*'+str(pid)+r':\t';dl=debug.splitlines()
  marker=re.compile(prefix+r'file='+re.escape(expected_root['path'])+r' \[0\];  generating link map')
  roots=[i for i,line in enumerate(dl)if marker.fullmatch(line)]
  need(len(roots)==1 and roots[0]+1<len(dl),'LOADER_EXACT_ROOT_LINK_MAP')
  base=re.fullmatch(prefix+r'  dynamic: 0x[0-9a-f]{16}  base: 0x([0-9a-f]{16})   size: 0x[0-9a-f]{16}',dl[roots[0]+1])
  need(base is not None and int(base.group(1),16)==address,'LOADER_SAME_PROCESS_ROOT_BASE')
  proof={'path':expected_root['path'],'sha256':expected_root['sha256'],'loaderSha256':LOADER_SHA,'anonymousLineIndex':0,'baseAddress':'0x'+anonymous[0][1].group(1),'sameInvocationPid':pid,'rootLinkMapPairVerified':True}
 named=[];vdso=0
 for index,line in enumerate(lines):
  if proof is not None and index==0:continue
  if re.fullmatch(r'\tlinux-vdso\.so\.1 \(0x[0-9a-f]{16}\)',line):vdso+=1;need(vdso<=1,'LOADER_DUPLICATE_VDSO');continue
  m=re.fullmatch(r'\t(?:[^\s]+ => )?(/[^\s]+) \(0x[0-9a-f]{16}\)',line)
  need(m is not None,'LOADER_LINE_FORMAT');named.append(m.group(1))
 return {'namedPaths':named,'anonymousRoot':proof,'vdsoRows':vdso,'staticWithoutNeeded':False}

def loader_checks():
 owner(LOADER);libpath=str(TARGET/'usr/lib/aarch64-linux-gnu')+':'+str(TARGET/'usr/lib/postgresql/14/lib')
 elfs=[]
 for p,x in expected.items():
  if x['type']=='file':
   with open(TARGET/p,'rb')as f:magic=f.read(4)
   if magic==b'\x7fELF':elfs.append(p)
 elf_metadata={};root_rows=[]
 for p in elfs:
  info=elf_info(TARGET/p);elf_metadata[p]=info
  root=owner(TARGET/p);loader=owner(LOADER)
  argv=[str(LOADER),'--inhibit-cache','--library-path',libpath,'--list',str(TARGET/p)]
  data,debug=run(argv,extra={'LD_DEBUG':'files'},separate_stderr=True)
  parsed=parse_loader_listing(data,debug,{'path':str(TARGET/p),'sha256':expected[p]['sha256']},root,loader,commands[-1]['pid'],info)
  proof=parsed['anonymousRoot']
  if proof is not None:root_rows.append({**proof,'commandLog':commands[-1]['log'],'stderrLog':commands[-1]['stderrLog']})
  for path in parsed['namedPaths']:owner(Path(path))
 checks=[('usr/lib/postgresql/14/bin/'+n,['--version'])for n in['postgres','pg_ctl','initdb','psql','pg_dump','pg_restore']]
 checks += [('usr/bin/redis-server',['--version']),('usr/bin/redis-cli',['--version']),('usr/bin/openssl',['version','-a'])]
 for p,args in checks:
  exe=TARGET/p;owner(exe)
  data=run([str(LOADER),'--inhibit-cache','--library-path',libpath,'--argv0',str(exe),str(exe)]+args,extra={'LD_DEBUG':'libs,files','OPENSSL_CONF':str(TARGET/'etc/ssl/openssl.cnf')})
  for found in re.findall(r'calling (?:init|fini):\s+(/[^\s]+)',data):owner(Path(found))
  need(('PostgreSQL) 14.24'in data)if p.startswith('usr/lib/postgresql/')else('v=7.0.15'in data if p.endswith('redis-server')else'redis-cli 7.0.15'in data if p.endswith('redis-cli')else'OpenSSL 3.0.13'in data),'VERSION_OUTPUT')
 return {'elfCount':len(elfs),'elfMetadata':elf_metadata,'versionCommands':len(checks),'libraries':list(library_cache.values()),'verifiedAnonymousRootRows':root_rows}


def digest_arg(value):
 need(isinstance(value,str) and re.fullmatch('[0-9a-f]{64}',value),'EXTERNAL_DIGEST_REQUIRED')
 return value


def unique_object(pairs):
 result={}
 for key,value in pairs:
  need(key not in result,'DUPLICATE_JSON_KEY');result[key]=value
 return result


def load(path,digest,limit=4*1024**2):
 """Read public pinned JSON from one held regular-file descriptor."""
 digest_arg(digest)
 need(path.resolve(strict=True)==path,'INPUT_SYMLINK')
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
 with os.fdopen(fd,'rb') as source:
  before=os.fstat(source.fileno())
  need(stat.S_ISREG(before.st_mode) and before.st_nlink==1 and before.st_size<=limit,'INPUT_FILE_METADATA')
  need(before.st_uid in (0,1100) and not before.st_mode&0o022,'INPUT_FILE_PERMISSIONS')
  raw=source.read(limit+1);after=os.fstat(source.fileno())
  stable=lambda info:(info.st_dev,info.st_ino,info.st_mode,info.st_uid,info.st_gid,
                      info.st_nlink,info.st_size,info.st_mtime_ns,info.st_ctime_ns)
  need(len(raw)==before.st_size and stable(before)==stable(after),'INPUT_CHANGED')
  need(hashlib.sha256(raw).hexdigest()==digest,'INPUT_SHA')
 return json.loads(raw,object_pairs_hook=unique_object)


def platform_identity():
 need(sys.flags.isolated and os.getuid()==os.geteuid()==1100,'UID_OR_ISOLATED_PYTHON')
 need(os.getgid()==os.getegid()==1100,'GID')
 need(os.uname().machine=='aarch64','HOST_ARCH')
 need(not any(k.startswith(('PG','LD_')) for k in os.environ),'CLEAN_PARENT_ENVIRONMENT')
 need(hasattr(os,'pidfd_open') and hasattr(signal,'pidfd_send_signal'),'PIDFD_REQUIRED')
 release={}
 for line in Path('/etc/os-release').read_text().splitlines():
  if '=' in line:
   key,value=line.split('=',1);release[key]=value.strip('"')
 need(release.get('ID')=='ubuntu' and release.get('VERSION_ID')=='24.04','OS_BASELINE')
 boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip()
 need(re.fullmatch('[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}',boot),'BOOT_FORMAT')
 return {'hostname':os.uname().nodename,'bootId':boot,'architecture':'aarch64',
         'uid':1100,'gid':1100,'osId':'ubuntu','osVersion':'24.04'}


def target_paths(paths):
 """The fixed UID's direct children keep write scope small and non-overlapping."""
 need(set(paths)=={'input','base','target','output'},'PATH_KEYS')
 root=ROOT.lstat()
 need(ROOT.resolve(strict=True)==ROOT and stat.S_ISDIR(root.st_mode)
      and root.st_uid==1100 and not root.st_mode&0o022,'ROOT_DIRECTORY')
 result={}
 for key,value in paths.items():
  need(isinstance(value,str),'PATH_TYPE');path=Path(value)
  need(path.parent==ROOT and re.fullmatch('[A-Za-z0-9][A-Za-z0-9_.-]{0,95}',path.name),'TARGET_PATH_SCOPE')
  need(str(path)==value,'PATH_CANONICAL_TEXT')
  if key in ('input','base'):
   info=path.lstat()
   need(path.resolve(strict=True)==path and stat.S_ISDIR(info.st_mode)
        and info.st_uid==1100 and not info.st_mode&0o022,'EXISTING_DIRECTORY')
  else:
   need(not path.exists() and not path.is_symlink(),'TARGET_EXISTS')
  result[key]=path
 need(len(set(result.values()))==4,'PATH_COLLISION')
 return result


def scope_policy(path,digest):
 policy=load(path,digest)
 need(set(policy)=={'kind','limit','reader','expectedRootPaths'},'SCOPE_POLICY_KEYS')
 need(policy['kind']=='OFFLINE_HOST_BUDGET_SCOPE_V1' and policy['limit']==CAP,'SCOPE_POLICY_KIND_CAP')
 roots=policy['expectedRootPaths']
 need(isinstance(roots,list) and 4<=len(roots)<=4096 and len(roots)==len(set(roots)),'SCOPE_ROOT_SET')
 for value in roots:
  need(isinstance(value,str) and len(value)<=4096 and value.startswith('/')
       and '..' not in PurePosixPath(value).parts and str(PurePosixPath(value))==value,'SCOPE_ROOT_PATH')
 reader=policy['reader']
 need(set(reader)=={'entrySha256','dependencies'},'SCOPE_READER_KEYS')
 digest_arg(reader['entrySha256'])
 deps=reader['dependencies']
 need(isinstance(deps,list) and 1<=len(deps)<=16,'SCOPE_READER_DEPENDENCIES')
 for item in deps:
  need(set(item)=={'name','sha256'} and re.fullmatch('[A-Za-z0-9_.-]+',item['name']),'READER_DEPENDENCY_NAME')
  digest_arg(item['sha256'])
 need(len({item['name'] for item in deps})==len(deps),'READER_DEPENDENCY_DUPLICATE')
 return policy


def check_budget(budget,policy,now):
 """The trusted host authenticates the reader; guest checks its exact reviewed scope."""
 need(budget.get('scopeNarrowed') is False,'BUDGET_NARROWED')
 need(budget.get('reader')==policy['reader'],'BUDGET_READER_CHAIN')
 at=datetime.datetime.fromisoformat(budget['at'].replace('Z','+00:00'))
 need(at.tzinfo is not None and 0<=(now-at).total_seconds()<=120,'BUDGET_FRESH')
 need(budget.get('limit')==CAP,'BUDGET_CAP')
 rows=budget['rows'];need(isinstance(rows,list) and len(rows)==len(policy['expectedRootPaths']),'BUDGET_ROWS')
 need(all(isinstance(row,dict) and isinstance(row.get('path'),str)
          and type(row.get('allocatedBytes')) is int and row['allocatedBytes']>=0 for row in rows),'BUDGET_ROW_TYPES')
 need({row['path'] for row in rows}==set(policy['expectedRootPaths']),'BUDGET_EXACT_SCOPE')
 total=budget.get('totalAllocatedBytes')
 need(type(total) is int and total==sum(row['allocatedBytes'] for row in rows),'BUDGET_SUM')
 need(total+RESERVE<=CAP,'BUDGET_FRESH_CAP')


def base_install(base,digest):
 receipt=load(base/'INSTALL-RECEIPT.json',digest)
 expected_receipt={'status':'EXTRACTED_AND_VERIFIED_NOT_STARTED','target':str(base),
   'archiveSha256':BASE_ARCHIVE_SHA,'archiveBytes':552309013,'manifestSha256':BASE_MANIFEST_SHA,
   'entries':17225,'uncompressedFileBytes':1197130603,'servicesStarted':False,
   'systemPackagesInstalled':False,'identity':{
    'sourceCommit':'147f2db23a3a1c4fabce7b31fb4db542d08dc0b9',
    'sourceTree':'b7552adf04725b32aaff0cd8e253d4ff959ee275',
    'release':'truck-recovery-r27-147f2db23a3a','buildTime':'2026-10-25T14:10:48Z'}}
 need(receipt==expected_receipt,'BASE_INSTALL_RECEIPT')
 # The archive and individual payload bytes are fixed independent of this receipt.
 # Its externally supplied digest binds this target's installation provenance.
 return receipt


def prepare_target(args):
 identity=platform_identity()
 paths=target_paths({'input':args.input,'base':args.base,'target':args.target,'output':args.output})
 digest_arg(args.base_install_sha256);digest_arg(args.budget_policy_sha256)
 base_install(paths['base'],args.base_install_sha256)
 scope_policy(paths['input']/'host-budget-policy.json',args.budget_policy_sha256)
 binding={'kind':'OFFLINE_RUNTIME_TARGET_V1','platform':identity,
          'paths':{key:str(value) for key,value in paths.items()},
          'baseInstallSha256':args.base_install_sha256,'budgetPolicySha256':args.budget_policy_sha256,
          'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 if getattr(args,'base_update',None):
  digest_arg(args.base_update_sha256)
  extra=load(Path(args.base_update),args.base_update_sha256,65536)
  need(set(extra)=={'baseUpdate','baseUpdateSupport'},'SUPPLEMENT_BINDING_KEYS')
  binding.update(extra)
 path=paths['input']/'target-binding.json'
 durable(path,binding)
 return {'status':'TARGET_BOUND_NOT_INSTALLED','bindingPath':str(path),'bindingSha256':sha(path),
         'authorizationGranted':False,'servicesChanged':False}


def fixed_inputs(args):
 global INPUT,BASE,TARGET,OUT,DEBS,BOOT,ENV
 identity=platform_identity()
 input_path=Path(args.input)
 need(input_path.parent==ROOT and input_path.resolve(strict=True)==input_path,'INPUT_PATH')
 binding=load(input_path/'target-binding.json',args.binding_sha256)
 required={'kind','platform','paths','baseInstallSha256','budgetPolicySha256','createdAt'}
 need(set(binding) in (required,required|{'baseUpdate','baseUpdateSupport'})
      and binding['kind']=='OFFLINE_RUNTIME_TARGET_V1','BINDING_SCHEMA')
 need(binding['platform']==identity,'TARGET_IDENTITY_CHANGED')
 paths=target_paths(binding['paths'])
 need(paths['input']==input_path,'INPUT_BINDING_PATH')
 INPUT,BASE,TARGET,OUT=(paths[key] for key in ('input','base','target','output'))
 DEBS=BASE/'dependencies/debs';BOOT=identity['bootId']
 ENV={'PATH':'/usr/bin:/bin','HOME':str(ROOT),'LANG':'C','LC_ALL':'C','TMPDIR':str(OUT)}
 selection=load(INPUT/'selection.json',SELECTION_SHA)
 entries=load(INPUT/'payload-entries.json',ENTRIES_SHA)
 bases=exact_base_update(load(BASE/'dependencies/base-prerequisites.json',BASE_SHA))
 bases=exact_supplemental_update(bases,binding)
 base_install(BASE,binding['baseInstallSha256'])
 policy=scope_policy(INPUT/'host-budget-policy.json',binding['budgetPolicySha256'])
 budget=load(INPUT/'budget.json',args.budget_sha256,8*1024**2)
 check_budget(budget,policy,datetime.datetime.now(datetime.timezone.utc))
 need(len(selection['packages'])==20 and len(bases['packages'])==122,'FIXED_SELECTION')
 # The pinned old selection supplies software identities only; its old paths and
 # timestamps are source provenance. All current destinations come from binding.
 archive_entries.extend(entries)
 for item in entries:
  path=item['path']
  need(path in ('.','') or (not path.startswith('/') and '..' not in PurePosixPath(path).parts),'PAYLOAD_PATH')
  need(item['type'] in ('dir','file','symlink') and not int(item['mode'],8)&0o6000,'PAYLOAD_TYPE_MODE')
  if item['type']!='dir':need(path not in expected,'PAYLOAD_DUPLICATE')
  elif path in expected:
   need(all(expected[path][key]==item[key] for key in ('type','mode','bytes')),'DIRECTORY_CLAIM_CONFLICT')
  expected[path]=item
 links={path for path,item in expected.items() if item['type']=='symlink'}
 for path in expected:need(not any(str(parent) in links for parent in PurePosixPath(path).parents),'SYMLINK_PARENT')
 for package in selection['packages']:
  file=DEBS/package['file'];info=regular(file,package['bytes'])
  need(file.resolve(strict=True)==file and info.st_size==package['bytes'] and sha(file)==package['sha256'],'DEB_PIN')
 capacity(initial=True)
 return selection,bases,identity,binding


def final_verification(defer_native_checks=False):
 tree=verify_tree()
 if defer_native_checks:
  # This phase is never a native-runtime success receipt. Downstream runtime
  # admission must still require its own actual loader/process evidence.
  need(tree==verify_tree(),'FINAL_TREE_CHANGED')
  return tree,None,'FIXED_RUNTIME_PAYLOAD_EXTRACTED_AND_READBACK_VERIFIED'
 loader=loader_checks()
 need(tree==verify_tree(),'FINAL_TREE_CHANGED')
 need(loader['elfCount']==134 and loader['versionCommands']==9,'FIXED_VERIFICATION_COVERAGE')
 return tree,loader,'NEW_PREFIX_RUNTIME_PAYLOAD_AND_ELF_VERIFIED'


def main():
 parser=argparse.ArgumentParser(description=__doc__)
 commands_parser=parser.add_subparsers(dest='action',required=True)
 prepare=commands_parser.add_parser('prepare-target',help='create a new public target binding; do not install')
 for name in ('input','base','target','output','base-install-sha256','budget-policy-sha256'):
  prepare.add_argument('--'+name,required=True)
 prepare.add_argument('--base-update');prepare.add_argument('--base-update-sha256')
 install=commands_parser.add_parser('install',help='explicit one-shot extraction and complete verification')
 for name in ('input','binding-sha256','budget-sha256'):
  install.add_argument('--'+name,required=True)
 install.add_argument('--execute',action='store_true')
 install.add_argument('--defer-native-checks',action='store_true',
                      help='verify payload only; explicitly leave loader and versions NOT_EXECUTED')
 check=commands_parser.add_parser('check-base-admission',help='read-only exact base/owner admission; never install')
 for name in ('input','binding-sha256','budget-sha256'):check.add_argument('--'+name,required=True)
 args=parser.parse_args()
 if args.action=='install' and not args.execute:
  print(json.dumps({'status':'PLAN_NOT_EXECUTED'}));return 0
 os.umask(0o022)
 resource.setrlimit(resource.RLIMIT_CORE,(0,0))
 resource.setrlimit(resource.RLIMIT_AS,(1024**3,1024**3))
 resource.setrlimit(resource.RLIMIT_CPU,(180,180))
 signal.signal(signal.SIGALRM,alarm);signal.alarm(300)
 created_output=False
 try:
  if args.action=='prepare-target':
   print(json.dumps(prepare_target(args)));return 0
  selection,bases,identity,binding=fixed_inputs(args)
  if args.action=='check-base-admission':
   base_rows=query_base(bases,readonly=True)
   checked=[owner(Path(path)) for path in sorted(supplemental_file_pins)]
   print(json.dumps({'status':'NOT_INSTALLED_BASE_ADMISSION_VERIFIED','platform':identity,
     'targetBindingSha256':args.binding_sha256,'basePackageCount':len(base_rows),
     'baseUpdate':base_update_binding,'supplementalBaseUpdate':supplemental_update_binding,
     'supplementalOwners':checked,'commands':commands,'filesWritten':False,
     'servicesChanged':False,'loaderExecuted':False,'databaseAccessed':False}));return 0
  OUT.mkdir(mode=0o700);created_output=True
  TARGET.mkdir(mode=0o700)
  durable(OUT/'intent.json',{'status':'PREPARED_FOR_FIXED_20_DEB_EXTRACTION',
    'platform':identity,'targetBindingSha256':args.binding_sha256,'selectionSha256':SELECTION_SHA,
    'payloadEntriesSha256':ENTRIES_SHA,'hostBudgetSha256':args.budget_sha256,
    'budgetPolicySha256':binding['budgetPolicySha256'],'baseInstallSha256':binding['baseInstallSha256'],
    'capacity':capacity(),'servicesChanged':False,'baseUpdate':base_update_binding,
    'supplementalBaseUpdate':supplemental_update_binding})
  base_rows=query_base(bases)
  for package in selection['packages']:
   extract_fixed_deb(package)
   durable(OUT/(package['package']+'-extracted.json'),{'package':package['package'],
     'archiveSha256':package['sha256'],'capacity':capacity()})
  tree,loader,status=final_verification(args.defer_native_checks)
  final={'status':status,'platform':identity,
    'targetBindingSha256':args.binding_sha256,'selectionSha256':SELECTION_SHA,
    'hostBudgetSha256':args.budget_sha256,'budgetPolicySha256':binding['budgetPolicySha256'],
    'baseInstallSha256':binding['baseInstallSha256'],'target':str(TARGET),'tree':tree,
    'loader':loader,'nativeChecks':'NOT_EXECUTED' if args.defer_native_checks else 'EXECUTED',
    'basePackageCount':len(base_rows),'baseUpdate':base_update_binding,'supplementalBaseUpdate':supplemental_update_binding,
    'commands':commands,'capacity':capacity(),'systemPackageDatabaseChanged':False,
    'maintainerScriptsRun':False,'servicesStartedOrStopped':False,'databaseAccessed':False,
    'fullOfflineAcceptance':False,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
  durable(OUT/'result.json',final)
  print(json.dumps({'status':final['status'],'resultSha256':sha(OUT/'result.json')}));return 0
 except BaseException as exc:
  code=str(exc) if isinstance(exc,Refused) else type(exc).__name__
  failure={'status':'FAILED_RETAINED_NO_RETRY','errorType':type(exc).__name__,'errorCode':code,
    'commands':commands,'elapsedSeconds':round(time.monotonic()-started,3),
    'targetRetained':TARGET is not None and TARGET.exists(),'outputRetained':created_output}
  if created_output:
   try:durable(OUT/'failure.json',failure)
   except BaseException:pass
  print(json.dumps({key:failure[key] for key in ('status','errorType','errorCode')}));return 1
 finally:signal.alarm(0)


if __name__=='__main__':raise SystemExit(main())
