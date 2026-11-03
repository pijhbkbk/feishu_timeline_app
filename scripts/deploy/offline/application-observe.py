"""Bounded resource and executable-map observations for the joint application only."""
from pathlib import Path
import datetime,hashlib,os,re,shutil,stat,time

def resources(m,base,budget_sha,starting=False,*,approved_limit=49*1024**3//2):
 m.need(type(approved_limit) is int and approved_limit in (49*1024**3//2,25*1024**3,101*1024**3//4),'APPROVED_HOST_LIMIT')
 m.need(re.fullmatch('[a-f0-9]{64}',budget_sha or '') is not None,'FRESH_BUDGET_ARGUMENT')
 b=m.pinned(m.INPUT/('budget-'+budget_sha+'.json'),budget_sha,4*1024**2)
 age=(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(b['at'])).total_seconds()
 m.need(0<=age<=120 and b.get('scopeNarrowed') is False and b.get('round30RootsIncluded') is True and b.get('limit')==approved_limit and sum(r['allocatedBytes'] for r in b['rows'])==b['totalAllocatedBytes'],'FRESH_COMPLETE_HOST_BUDGET')
 m.need({'/Users/lixiaochen/.lima-tcr24','/Users/lixiaochen/Library/Caches/lima','/opt/homebrew/Cellar/lima'}<={r['path'] for r in b['rows']},'FULL_HOST_BUDGET_ROOTS')
 reserve=64*1024**2 if starting else 0;free=shutil.disk_usage('/home/recovery').free
 mem={k:int(v.split()[0])*1024 for k,v in (l.split(':',1) for l in Path('/proc/meminfo').read_text().splitlines()) if k in ('MemAvailable','MemTotal')}
 m.need(b['totalAllocatedBytes']+64*1024**2<=approved_limit and free>=1024**3+reserve and mem['MemAvailable']>=(1536 if starting else 256)*1024**2,'APPLICATION_RESOURCE_ADMISSION')
 total=0;count=0;pending=[base.LOGS] if base.LOGS.exists() else []
 while pending:
  p=pending.pop();s=p.lstat();count+=1;m.need(count<=1024 and s.st_uid==1100 and not s.st_mode&0o022 and not stat.S_ISLNK(s.st_mode),'OWNED_APPLICATION_LOG_TREE')
  if stat.S_ISDIR(s.st_mode):pending.extend(p.iterdir())
  else:m.need(stat.S_ISREG(s.st_mode) and s.st_nlink==1,'APPLICATION_LOG_FILE');total+=s.st_blocks*512
 m.need(total<=16*1024**2,'APPLICATION_LOG_AGGREGATE_BOUND')
 return {'at':m.now(),'budgetSha256':budget_sha,'hostAllocatedBytes':b['totalAllocatedBytes'],'hostLimitBytes':approved_limit,'hostReservedBytes':64*1024**2,'guestAvailableBytes':free,'memory':mem,'newApplicationReservationBytes':reserve,'privateLogsAllocatedBytes':total,'boundary':'Fresh admission and sampled observations, not a hard storage quota; scanner window is separate.'}

def maps(m,base,run,native):
 owners=base.owners_for(base.run_dir(run));m.need(set(owners)==set(base.PORTS),'THREE_NEW_APPLICATION_OWNERS')
 permitted={r['path']:r for r in native['libraries']};checked={};result={}
 for role,owner in owners.items():
  m.need(base.matches(owner) and owner['executable']==str(m.NODE),'EXACT_JOINT_PROCESS')
  proc=Path('/proc')/str(owner['pid']);raw=(proc/'maps').read_bytes();m.need(len(raw)<=2*1024**2,'PROCESS_MAPS_BOUND');paths={}
  for line in raw.decode().splitlines():
   cells=line.split(maxsplit=5)
   if len(cells)!=6 or 'x' not in cells[1] or not cells[5].startswith('/'):continue
   name=cells[5];m.need(not name.endswith(' (deleted)'),'DELETED_EXECUTABLE_MAPPING')
   p=Path(name);m.need(p.resolve(strict=True)==p and name in permitted,'EXECUTABLE_MAPPING_NOT_IN_ACTUAL_NATIVE_CLOSURE')
   row=permitted[name];s=p.lstat();dev=cells[3].split(':');uid=0 if row['delivery']=='exact-122-base' else 1100
   m.need(stat.S_ISREG(s.st_mode) and s.st_uid==uid and not s.st_mode&0o022 and s.st_size==row['bytes'] and os.major(s.st_dev)==int(dev[0],16) and os.minor(s.st_dev)==int(dev[1],16) and s.st_ino==int(cells[4]),'EXECUTABLE_MAPPING_INODE_OWNER')
   sig=(s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
   if name not in checked:
    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW);h=hashlib.sha256();n=0
    try:
     o=os.fstat(fd);m.need((o.st_dev,o.st_ino,o.st_size,o.st_mtime_ns,o.st_ctime_ns)==sig,'MAP_HASH_OPEN_CHANGED')
     while True:
      b=os.read(fd,1024**2)
      if not b:break
      n+=len(b);m.need(n<=row['bytes'],'MAPPED_FILE_SIZE');h.update(b)
     z=os.fstat(fd);m.need((z.st_dev,z.st_ino,z.st_size,z.st_mtime_ns,z.st_ctime_ns)==sig and n==row['bytes'] and h.hexdigest()==row['sha256'],'ACTUAL_MAP_HASH')
    finally:os.close(fd)
    checked[name]={'path':name,'sha256':row['sha256'],'bytes':n,'delivery':row['delivery'],'stat':sig}
   m.need(checked[name]['stat']==sig,'MAPPED_FILE_CHANGED_BETWEEN_ROLES');paths[name]=checked[name]
  m.need(str(m.NODE) in paths and base.matches(owner),'NODE_MAP_AND_OWNER_POSTCHECK')
  result[role]={'pid':owner['pid'],'startTicks':owner['startTicks'],'uid':owner['uid'],'executable':owner['executable'],'cwd':owner['cwd'],'executableFiles':list(paths.values())}
 return {'at':m.now(),'status':'ACTUAL_JOINT_APPLICATION_EXECUTABLE_MAPS_VERIFIED','run':run,'processes':result,'files':len(checked),'databaseOrPrivateEnvironmentRead':False,'boundary':'Observed executable mappings only; an addon absent from these maps is not claimed loaded.'}

def record(m,base,run,phase,native,resource):
 value=maps(m,base,run,native);value['phase']=phase;value['resourceObservation']=resource
 p=base.run_dir(run)/('native-maps-'+str(time.time_ns())+'.json');h=m.write(p,value)
 return {'path':str(p),'sha256':h,'report':value}
