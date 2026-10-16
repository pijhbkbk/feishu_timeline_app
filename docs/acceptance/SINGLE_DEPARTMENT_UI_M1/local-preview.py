#!/usr/bin/env python3
"""Start/stop only this M1 preview's three owned loopback processes."""
import json, os, signal, socket, subprocess, sys, time
from pathlib import Path
BASE=Path(__file__).resolve().parent
STATE=BASE/'preview-processes.json'
PORTS={'api':3351,'web':3352,'proxy':3350}

def listening(port):
    with socket.socket() as s:
        s.settimeout(.2)
        return s.connect_ex(('127.0.0.1',port))==0

def birth(pid):
    result=subprocess.run(['ps','-p',str(pid),'-o','lstart=','-o','pgid='],capture_output=True,text=True)
    return result.stdout.strip() if result.returncode==0 else None

def save(value):
    p=STATE.with_suffix('.tmp');p.write_text(json.dumps(value,indent=2)+'\n');p.chmod(0o600);os.replace(p,STATE)

def stop():
    if not STATE.exists(): print('No M1-owned preview state; nothing stopped.');return
    state=json.loads(STATE.read_text())
    for p in reversed(state.get('processes',[])):
        current=birth(p['pid'])
        if current is None: continue
        if current!=p['birth'] or os.getpgid(p['pid'])!=p['pid']:
            raise SystemExit('Process identity changed; refusing to signal '+p['name'])
        os.killpg(p['pid'],signal.SIGTERM)
    until=time.monotonic()+35
    while time.monotonic()<until:
        if all(birth(p['pid']) is None for p in state.get('processes',[])): break
        time.sleep(.25)
    state['stoppedAt']=time.time();save(state)
    remaining=[p['name'] for p in state.get('processes',[]) if birth(p['pid'])==p['birth']]
    if remaining: raise SystemExit('Graceful stop incomplete; no force kill used: '+','.join(remaining))
    print('M1 preview stopped; databases, objects and scanner retained.')

def start(repo):
    repo=Path(repo).resolve();api=repo/'apps/api';web=repo/'apps/web'
    if not (api/'dist/main.js').is_file() or not (web/'.next/BUILD_ID').is_file(): raise SystemExit('Both production builds must exist first.')
    if STATE.exists():
        prior=json.loads(STATE.read_text())
        if any(birth(p['pid'])==p['birth'] for p in prior.get('processes',[])): raise SystemExit('Owned preview already running. Stop it first.')
    busy=[str(port) for port in PORTS.values() if listening(port)]
    if busy: raise SystemExit('Ports in use; existing processes preserved: '+','.join(busy))
    env=os.environ.copy();env.update(json.loads((BASE/'env.json').read_text()));env['M1_REPO']=str(repo)
    env['OBJECT_STORAGE_LOCAL_ROOT']=str(BASE/'objects')
    manifest=json.loads((repo/'m1-artifact-manifest.json').read_text())
    if manifest.get('status')!='BUILD_COMPLETE': raise SystemExit('Only completed immutable artifacts may start.')
    identity=manifest['identity']
    for key,value in {'EXPECTED_SOURCE_COMMIT':identity['sourceCommit'],'EXPECTED_SOURCE_TREE':identity['sourceTree'],'EXPECTED_RELEASE':identity['release'],'EXPECTED_BUILD_TIME':identity['buildTime']}.items(): env[key]=value
    state={'repo':str(repo),'startedAt':time.time(),'origin':'http://127.0.0.1:3350','profile':'production builds, explicit local API runtime','identity':identity,'processes':[]}
    commands=[('api',['node','dist/main.js'],api,env),('web',['pnpm','exec','next','start','-H','127.0.0.1','-p','3352'],web,{**env,'NODE_ENV':'production','DEPLOYMENT_ENV':'production','PORT':'3352'}),('proxy',['node',str(BASE/'proxy.mjs')],BASE,env)]
    for name,args,cwd,childenv in commands:
        log=BASE/(name+'.log')
        fd=os.open(log,os.O_WRONLY|os.O_CREAT|os.O_APPEND,0o600)
        try: proc=subprocess.Popen(args,cwd=cwd,env=childenv,stdout=fd,stderr=fd,start_new_session=True)
        finally: os.close(fd)
        identity=birth(proc.pid)
        if identity is None: raise SystemExit(name+' exited before startup; inspect its private log.')
        state['processes'].append({'name':name,'pid':proc.pid,'birth':identity,'port':PORTS[name]});save(state)
        until=time.monotonic()+25
        while time.monotonic()<until and not listening(PORTS[name]):
            if proc.poll() is not None: raise SystemExit(name+' failed; inspect '+str(log)+'; already started processes retained for explicit stop.')
            time.sleep(.25)
        if not listening(PORTS[name]): raise SystemExit(name+' readiness timed out; inspect '+str(log))
    print('Preview listening at http://127.0.0.1:3350; application interaction still requires verification.')

if len(sys.argv)<2: raise SystemExit('Use: preview.py start ABSOLUTE_BUILT_REPO | stop | status')
if sys.argv[1]=='start' and len(sys.argv)==3: start(sys.argv[2])
elif sys.argv[1]=='stop': stop()
elif sys.argv[1]=='status': print(json.dumps({'origin':'http://127.0.0.1:3350','listening':{name:listening(port) for name,port in PORTS.items()},'ownedStateExists':STATE.exists()}))
else: raise SystemExit('Unsupported command')
