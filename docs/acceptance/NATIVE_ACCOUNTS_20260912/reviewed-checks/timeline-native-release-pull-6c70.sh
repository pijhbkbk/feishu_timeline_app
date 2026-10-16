set -eu
sudo -n /usr/bin/python3 -I - <<'PY'
import pathlib,tempfile,os,stat,shutil,urllib.request,json,subprocess,hashlib,signal
registry='us-west1-docker.pkg.dev'
repository=registry+'/axial-acrobat-492709-r7/feishu-timeline/'
images={'api':'sha256:196a3631af5fcf76bffbfeb0651c290cfeeb7fd2adedad927e1bdf3c44556a22','web':'sha256:502308afb6c5a9fadc2f603fc0e99319a60ecf6108f56633ddc8b80ca050c5bc'}
base=pathlib.Path('/run/timeline-native-pulls')
assert os.geteuid()==0
for p in reversed(base.parents):
 i=p.lstat();assert stat.S_ISDIR(i.st_mode) and i.st_uid==0 and i.st_mode&0o022==0
try:base.mkdir(mode=0o700)
except FileExistsError:pass
i=base.lstat();assert stat.S_ISDIR(i.st_mode) and i.st_uid==0 and stat.S_IMODE(i.st_mode)==0o700
def stop(signum,frame):
 raise RuntimeError('Pinned image pull interrupted')
for signum in [signal.SIGTERM,signal.SIGHUP,signal.SIGINT]:signal.signal(signum,stop)
config=pathlib.Path(tempfile.mkdtemp(prefix='docker-auth-',dir=base))
print(json.dumps({'temporaryAuthenticationDirectory':str(config)}),flush=True)
env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','DOCKER_CONFIG':str(config)}
try:
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
 req=urllib.request.Request('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',headers={'Metadata-Flavor':'Google'})
 with opener.open(req,timeout=10) as response:
  value=json.loads(response.read(16384))
 token=value['access_token'];assert isinstance(token,str) and 20<len(token)<16000
 result=subprocess.run(['/usr/bin/docker','--config',str(config),'login','--username','oauth2accesstoken','--password-stdin',registry],input=token.encode(),env=env,capture_output=True,timeout=30)
 del token,value
 assert result.returncode==0,'Private registry authentication failed'
 for name,digest in images.items():
  ref=repository+name+'@'+digest
  log=config/(name+'-pull.log')
  with log.open('xb') as output:
   result=subprocess.run(['/usr/bin/docker','--config',str(config),'pull',ref],stdout=output,stderr=output,env=env,timeout=600)
  assert result.returncode==0,'Pinned image pull failed for '+name
  raw=subprocess.check_output(['/usr/bin/docker','image','inspect',ref],env=env,timeout=20)
  item=json.loads(raw)[0]
  labels=item['Config']['Labels']
  assert labels['org.opencontainers.image.revision']=='6c70a897ec7643f4681616d801481765aaa8f7bc'
  assert labels['com.feishu-timeline.source-tree']=='042c502720078f6f546931bf34c5396cb910c9fd'
  assert ref in item['RepoDigests'] and item['Architecture']=='amd64' and item['Os']=='linux'
  print(json.dumps({'component':name,'repositoryDigest':ref,'localImageId':item['Id'],'runtimeCommit':labels['org.opencontainers.image.revision']}),flush=True)
finally:
 for signum in [signal.SIGTERM,signal.SIGHUP,signal.SIGINT]:signal.signal(signum,signal.SIG_IGN)
 shutil.rmtree(config)
 print(json.dumps({'temporaryDockerAuthenticationRemoved':not config.exists()}),flush=True)
PY
