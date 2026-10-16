set -eu
/usr/bin/python3 -I - <<'FIXED_CHECKOUT'
import json, os, pathlib, pwd, stat, subprocess
commit='6c70a897ec7643f4681616d801481765aaa8f7bc'
tree='042c502720078f6f546931bf34c5396cb910c9fd'
base=pathlib.Path('/home/lixiaochen/timeline-native-delivery')
assert os.getuid()==pwd.getpwnam('lixiaochen').pw_uid
os.umask(0o077)
for p in (base,base/'source.git',base/'releases'):
 i=p.lstat();assert stat.S_ISDIR(i.st_mode) and i.st_uid==os.getuid() and i.st_mode&0o022==0
repo=base/'source.git';target=base/'releases'/commit
assert not os.path.lexists(target)
env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','HOME':'/home/lixiaochen','GIT_CONFIG_NOSYSTEM':'1'}
def git(path,*args):
 return subprocess.check_output(['/usr/bin/git','-C',str(path),'-c','core.hooksPath=/dev/null',*args],env=env,timeout=90).decode().strip()
assert git(repo,'rev-parse','refs/heads/codex/native-account-release')==commit
assert git(repo,'rev-parse','refs/heads/codex/native-account-ops')=='3ebcc84097f7a2c78d382f39afce79eff22ce58a'
subprocess.run(['/usr/bin/git','-c','core.hooksPath=/dev/null','clone','--no-hardlinks','--no-checkout',str(repo),str(target)],env=env,check=True,timeout=120)
git(target,'checkout','--detach',commit)
assert git(target,'rev-parse','HEAD')==commit and git(target,'rev-parse','HEAD^{tree}')==tree and git(target,'status','--porcelain')==''
assert stat.S_IMODE(target.stat().st_mode)==0o700
print(json.dumps({'remoteCommit':commit,'serverCheckoutHead':commit,'sourceTree':tree,'privateCheckout':str(target),'clean':True}))
FIXED_CHECKOUT
