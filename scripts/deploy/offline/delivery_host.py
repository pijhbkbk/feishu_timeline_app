#!/usr/bin/env python3
"""Invoke delivered, pinned operations on an explicitly bound existing Lima target.

No repository lookup, implicit target selection, VM creation, credential export,
file transfer or retry. Public inputs must already exist in the declared input
folder. The default preflight dispatches only the native read-only admission.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import stat
import subprocess
import sys
import time
import types

LIMIT = 24 * 1024**3
PROGRAMS = {'new-instance-config': 'prepare_instance.py',
            'runtime-dependencies': 'install_runtime_debs.py',
            'signature-refresh': 'refresh_signatures.py',
            'scanner': 'install_scanner.py', 'instance-lifecycle': 'instance_lifecycle.py'}


def need(ok, code):
    if not ok:
        raise RuntimeError('CHECK_' + code)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def read(path, limit=4*1024**2, expected=None):
    need(path.is_absolute() and path.resolve(strict=True) == path, 'CANONICAL_INPUT')
    before = path.lstat()
    need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and
         not before.st_mode & 0o022 and before.st_size <= limit, 'INPUT_METADATA')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    sig = lambda s: (s.st_dev, s.st_ino, s.st_mode, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
    try:
        chunks = []; size = 0
        while size <= limit:
            part = os.read(fd, min(65536, limit+1-size))
            if not part: break
            chunks.append(part); size += len(part)
        raw = b''.join(chunks)
        need(size == before.st_size and sig(before) == sig(os.fstat(fd)) == sig(path.lstat()), 'INPUT_CHANGED')
    finally:
        os.close(fd)
    if expected is not None:
        need(re.fullmatch('[a-f0-9]{64}', expected) and sha(raw) == expected, 'INPUT_SHA256')
    return raw


def unique(pairs):
    result = {}
    for k, v in pairs:
        need(k not in result, 'DUPLICATE_JSON_KEY'); result[k] = v
    return result


def decode(raw):
    return json.loads(raw, object_pairs_hook=unique)


class TransportFailure(RuntimeError):
    def __init__(self, code, stdout, stderr):
        super().__init__(code)
        self.stdout, self.stderr = stdout, stderr


def bounded(argv, env, cwd, timeout, cap):
    # Only the owned local transport process is terminated on failure. A failed
    # or interrupted invocation is never automatically repeated.
    process = subprocess.Popen(argv, env=env, cwd=cwd, stdin=subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    selector = selectors.DefaultSelector(); chunks = {1: [], 2: []}; sizes = {1: 0, 2: 0}
    for stream, key in ((process.stdout, 1), (process.stderr, 2)):
        selector.register(stream, selectors.EVENT_READ, key)
    started = time.monotonic()
    try:
        while selector.get_map():
            need(time.monotonic()-started <= timeout, 'TRANSPORT_TIMEOUT')
            for item, _ in selector.select(.1):
                part = os.read(item.fd, 65536)
                if not part: selector.unregister(item.fileobj); continue
                key = item.data; sizes[key] += len(part)
                if sizes[key] > cap:
                    chunks[key].append(part[:max(0, cap-(sizes[key]-len(part)))])
                    need(False, 'TRANSPORT_OUTPUT_BOUND')
                chunks[key].append(part)
        code = process.wait(timeout=max(.01, min(5, timeout-(time.monotonic()-started))))
        return code, b''.join(chunks[1]), b''.join(chunks[2])
    except RuntimeError as error:
        raise TransportFailure(str(error), b''.join(chunks[1]), b''.join(chunks[2])) from error
    except subprocess.TimeoutExpired as error:
        raise TransportFailure('CHECK_TRANSPORT_TIMEOUT', b''.join(chunks[1]), b''.join(chunks[2])) from error
    finally:
        selector.close()
        if process.poll() is None:
            process.terminate()
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired: pass
        process.stdout.close(); process.stderr.close()


def budget(policy, root, allowed_absent):
    roots = policy['expectedRootPaths']
    need(policy['kind'] == 'OFFLINE_HOST_BUDGET_SCOPE_V1' and policy['limit'] == LIMIT and
         1 <= len(roots) <= 4096 and len(roots) == len(set(roots)), 'COMPLETE_BUDGET_POLICY')
    need(isinstance(allowed_absent, list) and len(allowed_absent) <= 1 and
         set(allowed_absent) <= set(roots), 'ABSENT_ROOT_SCOPE')
    need(any(root.is_relative_to(Path(p)) for p in roots), 'DELIVERY_OUTSIDE_BUDGET')
    rows = []; absent = []; started = time.monotonic()
    for value in roots:
        need(time.monotonic()-started <= 60, 'HOST_BUDGET_DEADLINE')
        p = Path(value)
        need(p.is_absolute() and not p.is_symlink(), 'BUDGET_ROOT')
        if value in allowed_absent and not p.exists():
            need(p.parent.resolve(strict=True) == p.parent, 'ABSENT_ROOT_PARENT')
            rows.append({'path': value, 'allocatedBytes': 0, 'observation': 'ABSENT_EXPLICIT_ROOT'}); absent.append(p); continue
        need(p.resolve(strict=True) == p, 'CANONICAL_BUDGET_ROOT')
        code, out, _ = bounded(['/usr/bin/du', '-sk', str(p)], {'PATH': '/usr/bin:/bin'}, root, 30, 65536)
        need(code == 0 and out.split() and out.split()[0].isdigit(), 'BUDGET_DU_FAILED')
        rows.append({'path': value, 'allocatedBytes': int(out.split()[0])*1024})
    need(all(not p.exists() and not p.is_symlink() for p in absent), 'ABSENT_ROOT_CHANGED')
    total = sum(r['allocatedBytes'] for r in rows)
    need(total + 64*1024**2 <= LIMIT, 'HOST_PREFLIGHT_CAPACITY')
    return {'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'rows': rows,
            'totalAllocatedBytes': total, 'limit': LIMIT, 'reserve': 64*1024**2,
            'scopeNarrowed': False, 'readerSha256': sha(read(Path(__file__).resolve()))}


def prepare(root, manifest_sha, binding, entry, preflight):
    # Verify the checker before importing it; its digest comes from the external
    # manifest, not from the code under examination.
    manifest = decode(read(root/'manifest.json', expected=manifest_sha))
    rows = manifest['files']; by_name = {r['path']: r for r in rows}
    checker = root/'operations/delivery_check.py'
    checked_code = read(checker, expected=by_name['operations/delivery_check.py']['sha256'])
    module = types.ModuleType('delivered_integrity'); module.__file__ = str(checker)
    exec(compile(checked_code, str(checker), 'exec'), module.__dict__)
    integrity = module.check(root, manifest_sha)
    need(read(Path(__file__).resolve()) == read(root/'operations/delivery_host.py', expected=by_name['operations/delivery_host.py']['sha256']), 'DELIVERED_HOST_CODE')
    need(set(binding) == {'kind','lima','guest','inputFiles','budgetPolicy','allowedAbsentBudgetRoots','invocations'}, 'HOST_BINDING_SHAPE')
    need(binding['kind'] == 'R30_EXPLICIT_DELIVERY_HOST_V1', 'HOST_BINDING_KIND')
    guest = binding['guest']; lima = binding['lima']
    need(set(guest) == {'hostname','bootId','input'} and
         re.fullmatch(r'/home/recovery/[a-z0-9][a-z0-9-]{1,95}', guest['input']) and
         re.fullmatch(r'[0-9a-f-]{36}', guest['bootId']) and
         re.fullmatch(r'lima-[a-z0-9-]{1,96}', guest['hostname']), 'EXPLICIT_GUEST')
    need(set(lima) == {'path','sha256','home','vm'} and re.fullmatch(r'[a-z0-9][a-z0-9-]{1,95}', lima['vm']), 'LIMA_BINDING')
    cli = Path(lima['path']); need(cli.is_absolute(), 'LIMA_PATH')
    cli = cli.resolve(strict=True); read(cli, 128*1024**2, lima['sha256'])
    home = Path(lima['home']); need(home.is_absolute() and home.resolve(strict=True) == home and home.is_dir(), 'LIMA_HOME')
    need(entry in PROGRAMS and entry in binding['invocations'], 'SUPPORTED_ENTRYPOINT')
    declared = manifest['entrypoints'][entry]
    need(declared['program'] == 'operations/'+PROGRAMS[entry], 'ENTRY_PROGRAM')
    files = binding['inputFiles']; need(isinstance(files, list) and 1 <= len(files) <= 64, 'INPUT_FILE_COUNT')
    sources = []; pins = {}
    for row in files:
        need(set(row) == {'source','guest'} and re.fullmatch(r'/home/recovery/[a-z0-9][a-z0-9-]{1,95}/[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}', row['guest']), 'INPUT_MAPPING')
        need(row['source'] in by_name, 'UNDELIVERED_INPUT')
        actual = by_name[row['source']]
        need(actual['bytes'] <= 4*1024**2 and row['guest'] not in pins, 'INPUT_BOUND')
        pins[row['guest']] = {'sha256': actual['sha256'], 'bytes': actual['bytes']}
        sources.append(row['source'])
    need({declared['program'], *declared['support'], *declared['inputs']} <= set(sources), 'ENTRY_INPUT_CLOSURE')
    need(guest['input']+'/'+PROGRAMS[entry] in pins and all(any(r['source']==p and r['guest']==guest['input']+'/'+Path(p).name for r in files)
                                     for p in [declared['program'], *declared['support']]), 'SUPPORT_PLACEMENT')
    args = binding['invocations'][entry]
    need(isinstance(args, list) and 1 <= len(args) <= 64 and
         all(isinstance(a, str) and 0 < len(a) <= 4096 and not any(c in a for c in '\x00\r\n') for a in args) and
         sum(map(len,args)) <= 16384, 'PUBLIC_ARGUMENTS')
    if preflight:
        need(entry == 'new-instance-config' and args == ['--check-native-admission','--binding',guest['input']+'/configuration-check-binding.json',
             '--binding-sha256',pins.get(guest['input']+'/configuration-check-binding.json',{}).get('sha256')], 'READONLY_PREFLIGHT_COMMAND')
    policy_row = by_name.get(binding['budgetPolicy']); need(policy_row is not None, 'DELIVERED_BUDGET_POLICY')
    policy = decode(read(root/binding['budgetPolicy'], expected=policy_row['sha256']))
    observation = budget(policy, root, binding['allowedAbsentBudgetRoots'])
    return integrity, observation, pins, args, cli, home


GUEST = r'''import hashlib,json,os,platform,stat,sys
from pathlib import Path
settings=json.loads(sys.argv[1]);g=settings['guest'];root=Path(g['input'])
assert os.getuid()==os.getgid()==1100 and platform.system()=='Linux' and platform.machine()=='aarch64'
assert platform.node()==g['hostname'] and Path('/proc/sys/kernel/random/boot_id').read_text().strip()==g['bootId']
assert root.resolve(strict=True)==root and root.stat().st_uid==1100 and not root.stat().st_mode&0o077
program_bytes=None
for name,pin in settings['files'].items():
 p=Path(name);s=p.lstat();assert p.resolve(strict=True)==p and stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_uid==1100 and not s.st_mode&0o022 and s.st_size==pin['bytes']<=4*1024**2
 fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  b=b''
  while len(b)<=pin['bytes']:
   part=os.read(fd,min(65536,pin['bytes']+1-len(b)))
   if not part:break
   b+=part
  sig=lambda x:(x.st_dev,x.st_ino,x.st_mode,x.st_size,x.st_mtime_ns,x.st_ctime_ns)
  assert sig(s)==sig(os.fstat(fd))==sig(p.lstat()) and len(b)==pin['bytes'] and hashlib.sha256(b).hexdigest()==pin['sha256']
  if p==root/settings['program']:program_bytes=b
 finally:os.close(fd)
p=root/settings['program'];assert program_bytes is not None;sys.argv=[str(p),*settings['arguments']]
exec(compile(program_bytes,str(p),'exec'),{'__name__':'__main__','__file__':str(p)})
'''


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--delivery-root', type=Path, required=True); p.add_argument('--manifest-sha256', required=True)
    p.add_argument('--binding', type=Path, required=True); p.add_argument('--binding-sha256', required=True)
    p.add_argument('--entry', choices=sorted(PROGRAMS), default='new-instance-config')
    p.add_argument('--execute-reviewed', action='store_true'); p.add_argument('--output', type=Path, required=True)
    a = p.parse_args(); need(a.output.is_absolute() and a.output.parent.resolve(strict=True)==a.output.parent and not a.output.exists() and not a.output.is_symlink() and not a.output.is_relative_to(a.delivery_root), 'EXCLUSIVE_OUTPUT')
    b = decode(read(a.binding, expected=a.binding_sha256))
    integrity, observation, pins, args, cli, home = prepare(a.delivery_root,a.manifest_sha256,b,a.entry,not a.execute_reviewed)
    need(any(a.output.is_relative_to(Path(r['path'])) for r in observation['rows']), 'OUTPUT_OUTSIDE_BUDGET')
    a.output.mkdir(mode=0o700)
    def save(name, data):
        with (a.output/name).open('xb') as f: f.write(data);f.flush();os.fsync(f.fileno())
    save('budget.json', (json.dumps(observation,indent=2)+'\n').encode())
    settings = {'guest':b['guest'],'files':pins,'program':PROGRAMS[a.entry],'arguments':args}
    command = [str(cli),'shell','--workdir=/home/recovery',b['lima']['vm'],'--','/usr/bin/env','-i','PATH=/usr/bin:/bin','HOME=/home/recovery','/usr/bin/python3','-I','-B','-c',GUEST,json.dumps(settings,separators=(',',':'))]
    save('intent.json',(json.dumps({'entry':a.entry,'preflight':not a.execute_reviewed,'manifestSha256':a.manifest_sha256,'bindingSha256':a.binding_sha256,'guestProgram':b['guest']['input']+'/'+PROGRAMS[a.entry],'arguments':args,'automaticRetry':False},indent=2)+'\n').encode())
    transport_error = None
    try:
        code,out,err = bounded(command, {'PATH':'/usr/bin:/bin','HOME':str(Path.home()),'LIMA_HOME':str(home)}, a.delivery_root, 180 if not a.execute_reviewed else 1200, 4*1024**2)
    except TransportFailure as error:
        code,out,err = None,error.stdout,error.stderr; transport_error = str(error)
    save('stdout',out);save('stderr',err)
    result={'status':'DELIVERED_ENTRYPOINT_VERIFIED' if code==0 else 'DELIVERED_ENTRYPOINT_FAILED_RETAINED','at':dt.datetime.now(dt.timezone.utc).isoformat(),'exitCode':code,'transportError':transport_error,'guestOutcomeUncertain':transport_error is not None,'entry':a.entry,'preflightOnly':not a.execute_reviewed,'integrity':integrity,'hostBudgetAllocatedBytes':observation['totalAllocatedBytes'],'hostBudgetRoots':len(observation['rows']),'bindingSha256':a.binding_sha256,'stdoutSha256':sha(out),'stderrSha256':sha(err),'sourceCheckoutRead':False,'publicGuestInputsWritten':False,'automaticRetry':False}
    save('result.json',(json.dumps(result,indent=2)+'\n').encode());print(json.dumps(result));return code if code is not None else 1


if __name__ == '__main__':
    try: raise SystemExit(main())
    except Exception as error:
        print(json.dumps({'status':'DELIVERY_ENTRYPOINT_REFUSED_NO_RETRY','errorCode':str(error) if isinstance(error,RuntimeError) and re.fullmatch('CHECK_[A-Z0-9_]+',str(error)) else type(error).__name__}));raise SystemExit(1)
