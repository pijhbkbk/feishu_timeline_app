#!/usr/bin/env python3
"""Delivered normal joint lifecycle host entry for the one approved Lima target.

Reuses the bounded stdio transport; each startup phase receives a fresh complete
budget. Stop/status never require health, quota, scanner or capacity admission.
Tool paths derive from this delivery root; measurements retain the full scope.
"""
from pathlib import Path
import argparse
import datetime as dt
import hashlib
import json
import os
import re
import select
import stat
import subprocess
import sys
import time
import types

sys.dont_write_bytecode = True
HOST = Path(__file__).resolve()
OP = HOST.parent.parent
LIMA = Path("/opt/homebrew/bin/limactl")
LIMA_SHA = "04a4b12ac9d24f5fc9260caa0f8fc5d36cb97d548e82a16c348909c4e818f534"
INPUT = "/home/recovery/input-joint-lifecycle-20261031-r01"
TARGET_INPUTS = {
    "joint3a11": "/home/recovery/input-layout-recovery-20261031-r01",
    "layout5b07": "/home/recovery/input-layout-lifecycle-20261031-r01",
    "workbook9c412dd": "/home/recovery/input-workbook-lifecycle-20261031-r01",
    "save2e0c191": "/home/recovery/input-save-lifecycle-20261031-r02",
}
ROOT = "/home/recovery/joint-lifecycle-3a11-r01"
BOOT = "9fee751f-120b-451e-9b1b-b17eac34bf98"
PROTOCOL = "A09_BUDGET_STDIO_V1"
ENV = {
    "PATH": "/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    "HOME": "/Users/lixiaochen", "LANG": "C.UTF-8",
    "LIMA_HOME": "/Users/lixiaochen/.lima-tcr24",
}
BASE = [str(LIMA), "shell", "--workdir=/home/recovery",
        "truck-color-recovery-r24-20261025", "--"]
PHASES = {
    "prepare": True, "switch-pre-stop": True, "switch-post-stop": True,
    "switch-post-verify": False, "rollback-pre-stop": True,
    "rollback-prestart": True, "rollback-postverify": False,
}
state = {}


class Failure(Exception):
    pass


def need(value, label):
    if not value:
        raise Failure("CHECK_" + label)


def safe(exc):
    value = str(exc)
    return value if re.fullmatch(r"CHECK_[A-Z0-9_]{1,100}", value) else "CHECK_HOST_INTERNAL"


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def read(path, limit=4 * 1024**2, allow_fixed_symlink=False):
    path = Path(path)
    need(path.is_absolute(), "HOST_PATH")
    resolved = path.resolve(strict=True)
    need(allow_fixed_symlink or resolved == path, "HOST_CANONICAL")
    before = resolved.lstat()
    need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and before.st_size <= limit and not before.st_mode & 0o022,
         "HOST_INPUT_METADATA")
    with resolved.open("rb") as stream:
        opened = os.fstat(stream.fileno())
        raw = stream.read(limit + 1)
        after = os.fstat(stream.fileno())
    signature = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
    need(len(raw) == before.st_size and signature(before) == signature(opened)
         == signature(after) == signature(resolved.lstat()) and path.resolve(strict=True) == resolved,
         "HOST_INPUT_CHANGED")
    return raw


def pinned(path, digest, limit=4 * 1024**2):
    need(re.fullmatch(r"[a-f0-9]{64}", digest or ""), "HOST_EXTERNAL_SHA")
    raw = read(path, limit)
    need(sha(raw) == digest, "HOST_INPUT_SHA")
    return raw


def save(name, value):
    need(re.fullmatch(r"[a-z0-9.-]+", name), "HOST_OUTPUT_NAME")
    raw = value if isinstance(value, bytes) else (json.dumps(value, sort_keys=True, indent=2) + "\n").encode()
    need(len(raw) <= 8 * 1024**2, "HOST_OUTPUT_BOUND")
    path = state["out"] / name
    with path.open("xb") as stream:
        os.fchmod(stream.fileno(), 0o600)
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    return sha(raw)


def own_run(label, argv, data=None, timeout=60):
    """Only direct Popen children; no process-group kill, guest API signal or SIGKILL."""
    before = now()
    child = None
    fdout = state["out"] / (label + ".stdout")
    fderr = state["out"] / (label + ".stderr")
    result = {"at": before, "command": argv, "automaticRetry": False}
    try:
        with fdout.open("xb") as stdout, fderr.open("xb") as stderr:
            child = subprocess.Popen(
                argv, cwd=OP, env=ENV, stdin=subprocess.PIPE,
                stdout=stdout, stderr=stderr, start_new_session=True, close_fds=True,
            )
        result["hostChildPid"] = child.pid
        child.communicate(input=data, timeout=timeout)
        result["exitCode"] = child.returncode
        need(fdout.stat().st_size <= 4 * 1024**2 and fderr.stat().st_size <= 1024**2, "HOST_CHILD_OUTPUT")
        raw, error = read(fdout), read(fderr, 1024**2)
        result["stdoutSha256"], result["stderrSha256"] = sha(raw), sha(error)
        return subprocess.CompletedProcess(argv, child.returncode, raw, error)
    except BaseException as exc:
        result["failureCode"] = safe(exc)
        if child is not None and child.returncode is None:
            # Still our direct child; Popen checks its own wait status before TERM.
            try:
                child.terminate()
                child.wait(timeout=10)
                result["ownedChildTerminatedNormally"] = True
                result["exitCode"] = child.returncode
            except BaseException as cleanup:
                result["cleanupFailureCode"] = safe(cleanup)
                result["hostChildMayStillRun"] = True
        raise
    finally:
        result["finishedAt"] = now()
        save(label + ".command.json", result)


def load_budget_host():
    row=state["pins"]["files"]["delivery_host.py"]
    path=HOST.parent/"delivery_host.py"
    module=types.ModuleType("delivered_budget");module.__file__=str(path)
    exec(compile(pinned(path,row["sha256"]),str(path),"exec"),module.__dict__)
    def budget(name,inputdir,reserve):
        policy={"kind":"OFFLINE_HOST_BUDGET_SCOPE_V1","limit":49*1024**3//2,
                "expectedRootPaths":state["pins"]["budgetRootPaths"]}
        b=module.budget(policy,OP,["/Users/lixiaochen/Library/Caches/lima"],
                        approved_limit=49*1024**3//2)
        b.update(round30RootsIncluded=True,guestAccess=False)
        need(len(b["rows"])==376 and b["totalAllocatedBytes"]+reserve<=b["limit"],"FULL_BUDGET")
        raw=(json.dumps(b,sort_keys=True,indent=2)+"\n").encode();digest=sha(raw)
        save(name+".budget.json",raw)
        destination=INPUT+"/budget-"+digest+".json"
        code="import os,sys,hashlib;from pathlib import Path\np=Path("+repr(destination)+");b=sys.stdin.buffer.read(4*1024**2+1);assert os.getuid()==os.getgid()==1100 and len(b)<=4*1024**2 and p.parent.resolve()==p.parent;assert hashlib.sha256(b).hexdigest()=="+repr(digest)+";fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)\nwith os.fdopen(fd,'wb') as f:f.write(b);f.flush();os.fsync(f.fileno())\nprint('EXCLUSIVE_0600_VERIFIED')"
        result=own_run(name+"-budget-transfer",BASE+["/usr/bin/python3","-I","-B","-c",code],raw,20)
        need(result.returncode==0 and result.stderr==b"" and result.stdout==b"EXCLUSIVE_0600_VERIFIED\n","BUDGET_TRANSFER")
        return digest
    return types.SimpleNamespace(budget=budget)


def transition(phase):
    action=state["action"];previous=state.get("phase")
    if action=="restart":
        allowed={None:{"prepare"},"prepare":{"switch-pre-stop"},"switch-pre-stop":{"switch-post-stop"},"switch-post-stop":{"switch-post-verify"}}
    elif action=="start":
        allowed={None:{"prepare"},"prepare":{"switch-post-stop"},"switch-post-stop":{"switch-post-verify"}}
    else:allowed={}
    need(phase in allowed.get(previous,set()),"BUDGET_PHASE_ORDER")
    state["phase"]=phase


def reply_budget(message, channel):
    need(set(message) == {"status", "protocol", "requestId", "phase", "starting",
                         "bootId", "guestPid", "guestStartTicks"}, "REQUEST_SCHEMA")
    phase = message["phase"]
    need(phase in PHASES and message["starting"] is PHASES[phase], "REQUEST_PHASE")
    need(message["protocol"] == PROTOCOL and message["bootId"] == BOOT
         and message["guestPid"] == state["guestPid"]
         and message["guestStartTicks"] == state["guestStartTicks"]
         and message["requestId"] == state["event"] + ":" + phase, "REQUEST_BINDING")
    transition(phase)
    state["budgetName"] = "budget-" + phase
    # The delivered full-budget reader conservatively retains this reserve
    # even after startup. Do not advertise a weaker zero-reserve check.
    state["reserve"] = 64 * 1024**2
    response = {"status": "BUDGET_READY", "protocol": PROTOCOL,
                "requestId": message["requestId"], "phase": phase}
    try:
        digest = state["h"].budget(state["budgetName"], INPUT, state["reserve"])
        raw = read(state["out"] / (state["budgetName"] + ".budget.json"))
        need(sha(raw) == digest, "BUDGET_RESULT_HASH")
        response["sha256"] = digest
    except Exception as exc:
        # New restore stage may request a new budget; never retry this stage or waive its failure.
        response["status"] = "BUDGET_REJECTED"
        response["code"] = safe(exc)
    save(state["budgetName"] + ".protocol.json", {"request": message, "response": response})
    raw_reply = (json.dumps(response, separators=(",", ":")) + "\n").encode()
    need(len(raw_reply) <= 4096, "HOST_REPLY_BOUND")
    channel.stdin.write(raw_reply)
    channel.stdin.flush()


def guest_launcher(argv, helper_sha):
    return (
        "import os,sys,json,hashlib;from pathlib import Path\n"
        "p=Path(" + repr(INPUT + "/joint_lifecycle.py") + ");s=p.lstat();"
        "assert os.getuid()==1100 and p.resolve(strict=True)==p and s.st_nlink==1;"
        "assert s.st_uid==1100 and s.st_mode&0o777==0o600 and s.st_size<=262144;"
        "raw=p.read_bytes();assert hashlib.sha256(raw).hexdigest()==" + repr(helper_sha) + "\n"
        "boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip();assert boot==" + repr(BOOT) + "\n"
        "ticks=Path('/proc/self/stat').read_text().rsplit(') ',1)[1].split()[19]\n"
        "print(json.dumps({'status':'GUEST_CONTROLLER_STARTED','bootId':boot,'guestPid':os.getpid(),"
        "'guestStartTicks':ticks,'uid':os.getuid()}),flush=True)\n"
        "sys.argv=" + repr(argv) + "\n"
        "exec(compile(raw,str(p),'exec'),{'__name__':'__main__','__file__':str(p)})\n"
    )


def handle_line(raw, child):
    need(len(raw) <= 8192, "GUEST_LINE_BOUND")
    message = json.loads(raw)
    need(isinstance(message, dict), "GUEST_MESSAGE")
    if "guestPid" not in state:
        need(set(message) == {"status", "bootId", "guestPid", "guestStartTicks", "uid"}
             and message["status"] == "GUEST_CONTROLLER_STARTED"
             and message["bootId"] == BOOT and message["uid"] == 1100
             and type(message["guestPid"]) is int and message["guestPid"] > 1
             and re.fullmatch(r"[0-9]+", message["guestStartTicks"]), "GUEST_HELLO")
        state["guestPid"], state["guestStartTicks"] = message["guestPid"], message["guestStartTicks"]
        save("guest-controller-owner.json", message)
    elif message.get("status") == "NEED_BUDGET":
        need("terminal" not in state, "MESSAGE_AFTER_TERMINAL")
        reply_budget(message, child)
    else:
        need("terminal" not in state and message.get("status") in {
            "FAILED_PRESERVED","JOINT_LIFECYCLE_RUNNING","JOINT_LIFECYCLE_STOPPED","JOINT_LIFECYCLE_STATUS"
        },"GUEST_TERMINAL")
        if "path" in message:
            need(message["path"]==ROOT+"/events/"+state["event"]+"/result.json" and
                 re.fullmatch(r"[a-f0-9]{64}",message.get("sha256","")),"GUEST_RESULT_PATH")
        if message["status"]!="FAILED_PRESERVED":
            expected={"start":"JOINT_LIFECYCLE_RUNNING","restart":"JOINT_LIFECYCLE_RUNNING",
                      "stop":"JOINT_LIFECYCLE_STOPPED","status":"JOINT_LIFECYCLE_STATUS"}[state["action"]]
            need(message["status"]==expected,"GUEST_SUCCESS_STATUS")
            need(state.get("phase")==("switch-post-verify" if state["action"] in ("start","restart") else None),"GUEST_SUCCESS_PHASE")
            if state['action']!='status':
                need(set(message)=={'status','path','sha256'} and
                     message['path']==ROOT+'/events/'+state['event']+'/result.json' and
                     re.fullmatch('[a-f0-9]{64}',message['sha256']),'GUEST_SUCCESS_RECEIPT')
            else:
                need(set(message)=={'status','stateSha256','observed','pendingClaim'} and
                     re.fullmatch('[a-f0-9]{64}',message['stateSha256']) and
                     isinstance(message['observed'],dict),'GUEST_STATUS_OBSERVATION')
        state["terminal"]=message;save("guest-terminal.json",message)



def run_channel(argv):
    need(sha(read(LIMA, 64 * 1024**2, True)) == LIMA_SHA, "LIMACTL_PIN")
    child = None
    descriptors = {}
    buffers = {"stdout": bytearray(), "stderr": bytearray()}
    pending = b""
    failure = None
    truncated = False

    def receive(timeout, dispatch):
        nonlocal pending, failure, truncated
        if not descriptors:
            return
        ready, _, _ = select.select(list(descriptors), [], [], timeout)
        for fd in ready:
            data = os.read(fd, 8192)
            if not data:
                del descriptors[fd]
                continue
            kind = descriptors[fd]
            cap = 65536 if kind == "stdout" else 1024**2
            if len(buffers[kind]) + len(data) > cap:
                truncated = True
            buffers[kind].extend(data[:max(0, cap - len(buffers[kind]))])
            if not dispatch:
                continue
            need(not truncated, "HOST_CHANNEL_OUTPUT_BOUND")
            need(kind != "stderr", "GUEST_STDERR")
            pending += data
            need(len(pending) <= 16384, "GUEST_FRAME_BOUND")
            while b"\n" in pending:
                line, pending = pending.split(b"\n", 1)
                need(bool(line), "GUEST_EMPTY_LINE")
                handle_line(line, child)

    try:
        child = subprocess.Popen(
            argv, cwd=OP, env=ENV, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, close_fds=True, start_new_session=True,
        )
        # Register ownership before any parsing/handshake; all later exceptions enter cleanup.
        descriptors = {child.stdout.fileno(): "stdout", child.stderr.fileno(): "stderr"}
        save("channel-owner.json", {"at": now(), "hostChildPid": child.pid, "command": argv,
                                   "signalsAllowed": "This direct host child only; TERM, never KILL"})
        until = time.monotonic() + 900
        while descriptors:
            need(time.monotonic() < until, "HOST_CHANNEL_TIMEOUT")
            receive(min(1, max(0, until - time.monotonic())), True)
        child.wait(timeout=5)
        need(not pending and child.returncode == 0 and "terminal" in state
             and state["terminal"]["status"] != "FAILED_PRESERVED", "GUEST_EXECUTION_FAILED")
    except BaseException as exc:
        failure = safe(exc)
        if child is not None:
            try:
                child.stdin.close()
            except (OSError, ValueError):
                pass
            # Closed protocol stdin lets guest budget waits fail and its owned API cleanup run.
            # Continue draining; do not terminate the SSH channel while normal cleanup is pending.
            drain_until = time.monotonic() + 180
            try:
                while time.monotonic() < drain_until:
                    if descriptors:
                        receive(min(1, max(0, drain_until - time.monotonic())), False)
                    elif child.poll() is None:
                        time.sleep(0.1)
                    if child.poll() is not None and not descriptors:
                        break
            except BaseException as drain:
                state["channelDrainFailureCode"] = safe(drain)
            if child.poll() is None:
                try:
                    child.terminate()  # Unreaped direct host child; never API PID/group/VM.
                    child.wait(timeout=15)
                except BaseException as cleanup:
                    state["channelCleanupFailureCode"] = safe(cleanup)
                    state["hostChannelMayStillRun"] = child.poll() is None
        raise Failure(failure) from None
    finally:
        if child is not None and child.stdin is not None and not child.stdin.closed:
            child.stdin.close()
        save("channel.stdout", bytes(buffers["stdout"]))
        save("channel.stderr", bytes(buffers["stderr"]))
        save("channel-result.json", {
            "at": now(), "hostChildPid": None if child is None else child.pid,
            "exitCode": None if child is None else child.poll(),
            "failureCode": failure, "guestOutcomeUnconfirmed": failure is not None,
            "hostChannelMayStillRun": state.get("hostChannelMayStillRun", False),
            "channelDrainFailureCode": state.get("channelDrainFailureCode"),
            "channelCleanupFailureCode": state.get("channelCleanupFailureCode"),
            "guestControllerPid": state.get("guestPid"),
            "guestControllerStartTicks": state.get("guestStartTicks"),
            "outputTruncated": truncated, "forceKill": False, "automaticRetry": False,
        })


def main():
    global INPUT
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("action",choices=("status","start","stop","restart"))
    p.add_argument("--execute-reviewed",action="store_true");p.add_argument("--binding",type=Path)
    p.add_argument("--binding-sha256");p.add_argument("--expected-state-sha256")
    p.add_argument("--event");p.add_argument("--output",type=Path)
    a=p.parse_args()
    if not a.execute_reviewed:
        print(json.dumps({"status":"PLAN_ONLY","components":["api","web"],"executed":False}));return
    need(re.fullmatch('[a-z0-9][a-z0-9-]{0,47}',a.event or ''),"EVENT_NAME")
    need(re.fullmatch('[a-f0-9]{64}',a.expected_state_sha256 or ''),"EXTERNAL_STATE_PIN")
    pins=json.loads(pinned(a.binding,a.binding_sha256,256*1024))
    if pins.get('kind') == 'R30_JOINT_APPLICATION_LIFECYCLE_V2':
        need(pins.get('target') in TARGET_INPUTS, 'HOST_TARGET')
        INPUT = TARGET_INPUTS[pins['target']]
    else:
        need(pins.get('kind') == 'R30_JOINT_APPLICATION_LIFECYCLE_V1', 'HOST_BINDING_KIND')
    need(pins['bootId']==BOOT and pins['root']==ROOT and pins['guestInput']==INPUT,"HOST_BINDING")
    pinned(HOST,pins['files']['joint_lifecycle_host.py']['sha256'],256*1024)
    pinned(HOST.parent/'joint_lifecycle.py',pins['files']['joint_lifecycle.py']['sha256'],256*1024)
    need(len(pins['budgetRootPaths'])==len(set(pins['budgetRootPaths']))==376 and
         any(OP.is_relative_to(Path(r)) for r in pins['budgetRootPaths']),"FULL_BUDGET_SCOPE")
    need(a.output.is_absolute() and a.output.parent.resolve(strict=True)==a.output.parent and
         not a.output.is_relative_to(OP) and any(a.output.is_relative_to(Path(r)) for r in pins['budgetRootPaths']),"OUTPUT_SCOPE")
    a.output.mkdir(mode=0o700)
    state.update(out=a.output,pins=pins,event=a.event,action=a.action,
                 expectedStateSha256=a.expected_state_sha256)
    if a.action in ('start','restart'):state['h']=load_budget_host()
    argv=[INPUT+'/joint_lifecycle.py',a.action,'--execute-reviewed','--binding-sha256',a.binding_sha256,
          '--expected-state-sha256',a.expected_state_sha256,'--event',a.event]
    if a.action in ('start','restart'):argv.append('--budget-channel-stdio')
    command=BASE+['/usr/bin/env','-i','PATH=/usr/bin:/bin','HOME=/home/recovery','/usr/bin/python3','-I','-B','-u','-c',guest_launcher(argv,pins['files']['joint_lifecycle.py']['sha256'])]
    save('intent.json',{'at':now(),'bindingSha256':a.binding_sha256,'action':a.action,
                        'command':command,'sourceCheckoutRead':False,'automaticRetry':False})
    run_channel(command)
    print(json.dumps({'status':'CONTROLLER_EXITED_WITH_GUEST_SUCCESS','evidence':str(a.output),'guestResult':state['terminal']}))


if __name__=='__main__':
    os.umask(0o077)
    try:main()
    except Exception as exc:
        print(json.dumps({'status':'HOST_FAILED_PRESERVED','code':safe(exc)}));raise SystemExit(1)
