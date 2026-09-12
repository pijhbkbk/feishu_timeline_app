set -eu
sudo -n /usr/bin/python3 -I - <<'REMOTE'
import pathlib,os,stat,json,urllib.request,urllib.error,http.cookies,socket
assert os.geteuid()==0 and socket.gethostname()=='instance-20260408-091840'
root=pathlib.Path('/var/lib/timeline-native-app')
for p in [*reversed(root.parents),root]:
 i=p.lstat();assert stat.S_ISDIR(i.st_mode) and i.st_uid==0 and i.st_mode&0o022==0
assert stat.S_IMODE(root.stat().st_mode)==0o700
commit='f2da3629e13b2653aae8879c98992877d5ef4170'
assert json.loads((root/'cutover-committed.json').read_bytes())['runtimeCommit']==commit
p=root/'admin.password';fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
try:
 i=os.fstat(fd);assert stat.S_ISREG(i.st_mode) and i.st_uid==1000 and i.st_nlink==1 and stat.S_IMODE(i.st_mode)==0o600
 password=os.read(fd,513).decode().strip();assert len(password)==32
finally:os.close(fd)
prepared=json.loads((root/'prepared.json').read_bytes())
base='https://timeline.all-too-well.com'
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
records=[];cookie=None;issued_sessions=[];result=None

def request(path,method='GET',body=None,token=None,origin=base):
 headers={'Accept':'application/json','Cache-Control':'no-cache'}
 if origin:headers['Origin']=origin
 if token:headers['Cookie']=token
 if body is not None:headers['Content-Type']='application/json'
 req=urllib.request.Request(base+path,data=json.dumps(body).encode() if body is not None else None,headers=headers,method=method)
 try:r=opener.open(req,timeout=15)
 except urllib.error.HTTPError as error:r=error
 with r:
  code=r.code;headers=r.headers
  if path=='/api/auth/login':
   received=http.cookies.SimpleCookie();received.load(headers.get('Set-Cookie',''))
   if 'ft_session' in received and received['ft_session'].value:issued_sessions.append('ft_session='+received['ft_session'].value)
  raw=r.read(2*1024*1024+1);assert len(raw)<=2*1024*1024
  data=json.loads(raw) if 'application/json' in headers.get('Content-Type','') else None
 records.append({'method':method,'path':path,'status':code})
 return code,headers,data
try:
 for path in ['/api/health','/build-info']:
  status,headers,data=request(path);assert status==200 and data['runtimeCommit']==commit
  assert data['buildTime']=='2026-09-12T14:22:42Z' and data['release']=='native-auth-20260912-f2da3629e13b'
 for path in ['/api/auth/me','/api/projects']:
  assert request(path)[0]==401
 for origin in ['', 'https://attacker.invalid']:
  assert request('/api/auth/login','POST',{'username':'lixiaochen','password':password},origin=origin)[0]==403
 status,headers,data=request('/api/auth/login','POST',{'username':'lixiaochen','password':password})
 assert status==200
 cookies=http.cookies.SimpleCookie();cookies.load(headers.get('Set-Cookie',''));entry=cookies['ft_session']
 assert entry['httponly'] and entry['secure'] and entry['samesite'].lower()=='lax'
 cookie='ft_session='+entry.value
 assert data['user']['authSource']=='local' and data['user']['isSystemAdmin'] is True and data['feishuEnabled'] is False and data['mockEnabled'] is False
 actor_id=data['user']['id']
 assert actor_id==prepared['administratorId']
 status,headers,data=request('/api/auth/me',token=cookie);assert status==200 and data['id']==actor_id and data['authSource']=='local'
 assert request('/api/projects',token=cookie)[0]==200
 status,headers,data=request('/api/auth/accounts',token=cookie);assert status==200 and len(data)==12
 assert any(u['id']==actor_id and u['username']=='lixiaochen' and u['canLogin'] for u in data)
 for path in ['/api/auth/feishu/start','/api/auth/feishu/login-url']:
  status,headers,data=request(path);assert status==410 and headers.get('Location') is None
 assert request('/api/auth/mock-login','POST',{'roleCodes':['admin']})[0]==403
 assert request('/api/auth/logout','POST',token=cookie)[0]==200
 assert request('/api/auth/me',token=cookie)[0]==401
 cookie=None
 result={'exactDomainNativeHttp':'PASS','runtimeCommit':commit,'existingOwnerIdPreserved':True,'secureSessionCookie':True,'originNegativesPassed':True,'retiredIdentityEntrypointsClosed':True,'logoutRevocationVerified':True,'requestEvidence':records,'credentialsRecorded':False}
finally:
 cleanup_ok=True
 for issued in issued_sessions:
  try:cleanup_ok=(request('/api/auth/logout','POST',token=issued)[0]==200) and cleanup_ok
  except Exception:cleanup_ok=False
 assert cleanup_ok,'Some acceptance sessions could not be logged out'
if result is not None:
 result['allIssuedTestSessionsLoggedOut']=True
 print(json.dumps(result),flush=True)
REMOTE
