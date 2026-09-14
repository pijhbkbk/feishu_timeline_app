import datetime, hashlib, http.cookies, json, os, pathlib, re, stat, subprocess, sys, time, urllib.error, urllib.request

BASE='https://timeline.all-too-well.com'
OLD='f2da3629e13b2653aae8879c98992877d5ef4170'
NEW='6c70a897ec7643f4681616d801481765aaa8f7bc'
OUTPUT=pathlib.Path('/private/tmp/timeline-native-final-http-6c70.json')
assert not OUTPUT.exists()
file=pathlib.Path('/Users/lixiaochen/Downloads/timeline-native-admin-access.txt')
fd=os.open(file,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
try:
 info=os.fstat(fd)
 assert stat.S_ISREG(info.st_mode) and info.st_uid==os.getuid() and info.st_nlink==1 and stat.S_IMODE(info.st_mode)==0o600 and info.st_size<4096
 text=os.read(fd,4096).decode()
 match=re.search(r'^初始密码：([A-Za-z0-9_-]{32})$',text,re.M)
 assert match is not None,'Private credential format differs'
 password=match.group(1)
 del text,match
finally:os.close(fd)
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
requests=[];issued=[];cookie=None;result=None
def request(path,method='GET',body=None,token=None,origin=BASE):
 headers={'Accept':'application/json','Cache-Control':'no-cache','Pragma':'no-cache'}
 if origin:headers['Origin']=origin
 if token:headers['Cookie']=token
 if body is not None:headers['Content-Type']='application/json'
 req=urllib.request.Request(BASE+path,data=json.dumps(body).encode() if body is not None else None,headers=headers,method=method)
 try:response=opener.open(req,timeout=20)
 except urllib.error.HTTPError as error:response=error
 with response:
  code=response.code;headers=response.headers
  if path=='/api/auth/login':
   received=http.cookies.SimpleCookie();received.load(headers.get('Set-Cookie',''))
   if 'ft_session' in received and received['ft_session'].value:issued.append('ft_session='+received['ft_session'].value)
  raw=response.read(2*1024*1024+1);assert len(raw)<=2*1024*1024
 data=json.loads(raw) if 'application/json' in headers.get('Content-Type','') else None
 requests.append({'method':method,'path':path,'status':code})
 return code,headers,data,raw
def metadata(commit):
 values={}
 for path in ('/api/health','/build-info'):
  code,headers,data,raw=request(path)
  assert code==200 and data['runtimeCommit']==commit,'Exact-domain runtime differs'
  values[path]=data
 assert all(values['/api/health'][key]==values['/build-info'][key] for key in ('runtimeCommit','sourceTree','release','buildTime'))
 return values

try:
 prior=metadata(NEW)
 assert request('/api/auth/me')[0]==401
 status,headers,data,raw=request('/api/auth/login','POST',{'username':'lixiaochen','password':password})
 del password
 assert status==200,'Existing owner login failed before release'
 actor=data['user']['id']
 assert data['user']['authSource']=='local' and data['user']['isSystemAdmin'] and not data['feishuEnabled'] and not data['mockEnabled']
 parsed=http.cookies.SimpleCookie();parsed.load(headers['Set-Cookie']);entry=parsed['ft_session']
 assert entry['secure'] and entry['httponly'] and entry['samesite'].lower()=='lax'
 cookie='ft_session='+entry.value
 print(json.dumps({'newRuntime':'OWNER_NATIVE_LOGIN_PASS','runtimeCommit':NEW}),flush=True)
 current=metadata(NEW)
 status,_,data,_=request('/api/auth/me',token=cookie)
 assert status==200 and data['id']==actor and data['authSource']=='local','New native session identity differs'
 assert request('/api/projects',token=cookie)[0]==200
 status,_,data,_=request('/api/auth/accounts',token=cookie)
 assert status==200 and any(user['id']==actor and user['canLogin'] for user in data)
 status,_,_,raw=request('/login')
 assert status==200
 html=raw.decode()
 assert 'pattern="[A-Za-z0-9][A-Za-z0-9._\\-]{2,63}"' in html,'Published HTML pattern not corrected'
 assert '使用本系统账号，无需第三方登录' in html
 assets=list(dict.fromkeys(re.findall(r'<script[^>]+src="([^"]+)"',html)))
 assert assets and len(assets)<=40 and all(path.startswith('/_next/static/') for path in assets)
 for path in assets:assert request(path)[0]==200
 for path in ('/api/auth/feishu/start','/api/auth/feishu/login-url'):
  status,headers,_,_=request(path)
  assert status==410 and headers.get('Location') is None
 assert request('/api/auth/mock-login','POST',{'roleCodes':['admin']})[0]==403
 assert request('/api/auth/logout','POST',token=cookie,origin='https://attacker.invalid')[0]==403
 assert request('/api/auth/me',token=cookie)[0]==200
 assert request('/api/auth/logout','POST',token=cookie)[0]==200
 assert request('/api/auth/me',token=cookie)[0]==401
 result={'exactDomainNativeHttp':'PASS','checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
  'environment':'production','url':BASE,'runtimeCommit':NEW,'metadata':current,
  'newRuntimeNativeLogin':'PASS','ownerIdPreserved':True,
  'secureSessionCookie':True,'originNegativePassed':True,'retiredEntrypointsClosed':True,
  'logoutRevocationVerified':True,'publishedPatternCorrected':True,'staticAssetCount':len(assets),
  'credentialsRecorded':False,
  'browserAcceptance':'PENDING'}
finally:
 cleanup=True
 for token in issued:
  try:cleanup=(request('/api/auth/logout','POST',token=token)[0]==200) and cleanup
  except Exception:cleanup=False
 cookie=None;issued.clear()
 print(json.dumps({'allIssuedVerificationSessionsLoggedOut':cleanup}),flush=True)
 assert cleanup,'Verification session cleanup unproved'
if result is not None:
 result['allIssuedVerificationSessionsLoggedOut']=True
 result['requests']=requests
 fd=os.open(OUTPUT,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'w') as stream:json.dump(result,stream,indent=2)
 print(json.dumps({'exactDomainNativeHttp':'PASS','runtimeCommit':NEW,'requestCount':len(requests),'evidence':str(OUTPUT)}),flush=True)
