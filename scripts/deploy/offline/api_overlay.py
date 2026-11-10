#!/usr/bin/env python3
"""
API 单组件预览 r02 草稿；未执行，须完成独立审查及外部摘要绑定后执行。

默认 plan。只用于当前批准 VM、当前 boot 的 API 单组件预览。
不修改原配置、原应用、Web、proxy、PG、Redis 或 scanner。

外部 pins.json 必须独立审核并由 --pins-sha256 绑定：
{
  "kind": "A09_API_ONLY_OVERLAY_V1",
  "executionAllowed": false,
  "budgetProtocol": "A09_BUDGET_STDIO_V1",
  "helperSha256": "...",
  "buildManifestSha256": "66b3d6480e9d85f2b449eadbfbc4c3c9e105077a7036a9740ac5a549283ad875",
  "budgetRootPaths": ["完整新预算根集合；包含本次 preparation/output 根"]
}

新输入目录：
  /home/recovery/input-a09-api-overlay-20261030-r01/
    api_overlay.py
    pins.json
    build-manifest.json
    budget-<外部 SHA>.json
    dist/                    # 仅 manifest 声明的 256 个 JS

切换：
  python3 -I -B api_overlay.py --execute-reviewed \
    --pins-sha256 SHA --build-manifest-sha256 SHA \
    --budget-channel-stdio --event switch-r01 switch

正常恢复旧 API：
  python3 -I -B api_overlay.py --execute-reviewed \
    --pins-sha256 SHA --build-manifest-sha256 SHA \
    --budget-channel-stdio --event rollback-r01 \
    --start-receipt /home/recovery/api-overlay-a09-3a11b23-r01/events/switch-r01/result.json \
    --start-receipt-sha256 SHA rollback

rollback 的 start receipt 必须由调用者独立绑定。
失败清理只向本次新建 API 的稳定 pidfd 发送 SIGTERM；无 SIGKILL。
自动恢复仍须通过原配置、原制品、资源与四入口读回。
失败事实不会因恢复成功而改为成功。
"""
from pathlib import Path
from urllib.parse import urlsplit, unquote
import argparse
import datetime as dt
import hashlib
import json
import os
import re
import resource
import select
import signal
import stat
import subprocess
import sys
import time
import types

sys.dont_write_bytecode = True

INPUT = Path("/home/recovery/input-a09-api-overlay-20261030-r01")
LEGACY = Path("/home/recovery/input-r30-resume-app-20261028-r01")
ROOT = Path("/home/recovery/api-overlay-a09-3a11b23-r01")
DIST = ROOT / "dist"
R = Path("/home/recovery/instance")
ART = Path("/home/recovery/offline-software-r30-3941bec-r01/application")
NODE = Path("/home/recovery/offline-software-r30-3941bec-r01/runtime/node24/bin/node")
BOOT = "9fee751f-120b-451e-9b1b-b17eac34bf98"
UID = 1100
LIBPATH = (
    "/home/recovery/runtime-debs-r30-r02/usr/lib/aarch64-linux-gnu:"
    "/home/recovery/runtime-debs-r30-r02/usr/lib/postgresql/14/lib"
)
NODEPATH = str(ART / "apps/api/node_modules") + ":" + str(ART / "node_modules")
COMMON_SHA = "e5bcab7034c15c237ab860481377651c95b1991351af3a16e1acd0137424983a"
LEGACY_PINS_SHA = "d50968334e7582d074ef39483a8161bdd5fa41943946993c73a248b0d4b1d14d"
APP_SHA = "c6b3f29ca19eca0111e1127d1c4e07e1f4d8d2b142893ef8f0a1ca15056db8a2"
ASSEMBLY_SHA = "cc59aa924afefbd7101ca60eda0481de5c236400ab5029b7a2b9ccbf9b8a107c"
BUILD_SHA = "66b3d6480e9d85f2b449eadbfbc4c3c9e105077a7036a9740ac5a549283ad875"
OLD_START = R / "scanner-handoff-3941bec-r01/runs/newboot-preview-r30-r01/result.json"
OLD_START_SHA = "b3745264ad134c9cebe57366575399eb629c128275b059795e1e5e53329f1dfa"
NEW_ID = {
    "sourceCommit": "3a11b23edd291869d29331d2abc089d2ae6fbc67",
    "sourceTree": "8cc6afd7566142a967fd265b4a4f6b14f0c1f000",
    "release": "truck-a09-api-3a11b23edd29",
    "buildTime": "2026-10-30T01:51:46Z",
}
EXPECTED = {
    "EXPECTED_SOURCE_COMMIT": "sourceCommit",
    "EXPECTED_SOURCE_TREE": "sourceTree",
    "EXPECTED_RELEASE": "release",
    "EXPECTED_BUILD_TIME": "buildTime",
}
HOST_PREPARATION = (
    "/Users/lixiaochen/Downloads/feishu_timeline_app/var/"
    "truck-color-v1-20261020/final-execution-20261024-r01/"
    "r30-a09-api-overlay-preparation-20261030-r01"
)
# 当前同 boot 的共享服务；只观察 stat，不读取其配置或执行生命周期。
SHARED = ((1431, "19820", 109), (1467, "20074", 1100), (1826, "257820", 1100))
ctx = {}


class Rejected(Exception):
    pass


def need(ok, code):
    if not ok:
        raise Rejected("CHECK_" + code)


def code(exc):
    value = str(exc)
    return value if re.fullmatch(r"CHECK_[A-Z0-9_]{1,100}", value) else "CHECK_INTERNAL"


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def boot():
    need(os.getuid() == UID and os.getgid() == UID, "UID")
    need(os.uname().nodename == "lima-truck-color-recovery-r24-20261025", "VM")
    need(Path("/proc/sys/kernel/random/boot_id").read_text().strip() == BOOT, "BOOT")


def canonical(path):
    path = Path(path)
    need(path.is_absolute() and path.resolve(strict=True) == path, "CANONICAL_PATH")
    return path


def read(path, limit=8 * 1024**2):
    path = canonical(path)
    before = path.lstat()
    need(
        stat.S_ISREG(before.st_mode) and before.st_uid == UID
        and before.st_nlink == 1 and not before.st_mode & 0o022
        and before.st_size <= limit,
        "INPUT_METADATA",
    )
    sig = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        opened = os.fstat(fd)
        with os.fdopen(os.dup(fd), "rb") as stream:
            raw = stream.read(limit + 1)
        need(
            len(raw) == before.st_size
            and sig(before) == sig(opened) == sig(os.fstat(fd)) == sig(path.lstat()),
            "INPUT_CHANGED",
        )
        return raw
    finally:
        os.close(fd)


def pinned(path, digest, limit=8 * 1024**2):
    need(re.fullmatch(r"[a-f0-9]{64}", digest or ""), "EXTERNAL_SHA")
    raw = read(path, limit)
    need(sha(raw) == digest, "INPUT_SHA")
    return json.loads(raw)


def module(path, digest, name):
    raw = read(path, 256 * 1024)
    need(sha(raw) == digest, "HELPER_SHA")
    value = types.ModuleType(name)
    value.__file__ = str(path)
    exec(compile(raw, str(path), "exec"), value.__dict__)
    return value


def write(path, value):
    raw = (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()
    need(len(raw) <= 2 * 1024**2, "RECEIPT_BOUND")
    with Path(path).open("xb") as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    return sha(raw)


def private_dir(path, create=False):
    path = Path(path)
    if create:
        path.mkdir(mode=0o700)
    canonical(path)
    s = path.lstat()
    need(
        stat.S_ISDIR(s.st_mode) and s.st_uid == s.st_gid == UID
        and stat.S_IMODE(s.st_mode) == 0o700,
        "PRIVATE_DIRECTORY",
    )


def limits(log_bytes):
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_FSIZE, (log_bytes, log_bytes))
    resource.setrlimit(resource.RLIMIT_NOFILE, (256, 256))


def exited(fd):
    poller = select.poll()
    poller.register(fd, select.POLLIN)
    return bool(poller.poll(0))


def wait_exit(fd, seconds):
    until = time.monotonic() + seconds
    while time.monotonic() < until:
        if exited(fd):
            return
        time.sleep(0.1)
    raise Rejected("CHECK_TERM_TIMEOUT_NO_FORCE_KILL")



def bounded(label, argv, env, data=b"", timeout=25):
    """固定只读 child；异常也独立正常清理，不将错误/输出公开。"""
    need(re.fullmatch(r"[a-z0-9-]+", label), "COMMAND_LABEL")
    need(len(data) <= 4096, "COMMAND_STDIN_BOUND")
    out = ctx["logs"] / (label + ".stdout")
    err = ctx["logs"] / (label + ".stderr")
    child = None
    fd = None
    try:
        with out.open("xb") as stdout, err.open("xb") as stderr:
            child = subprocess.Popen(
                argv, cwd=ROOT, env=env, stdin=subprocess.PIPE,
                stdout=stdout, stderr=stderr, close_fds=True, start_new_session=True,
                preexec_fn=lambda: limits(128 * 1024),
            )
        fd = os.pidfd_open(child.pid)
        child.communicate(input=data, timeout=timeout)
        need(child.returncode == 0, "READONLY_COMMAND_EXIT")
        need(err.stat().st_size == 0 and out.stat().st_size <= 65536, "READONLY_COMMAND_OUTPUT")
        return read(out, 65536)
    except BaseException as exc:
        failure = "CHECK_READONLY_COMMAND_TIMEOUT" if isinstance(exc, subprocess.TimeoutExpired) else code(exc)
        cleanup = {"failureCode": failure, "pid": None if child is None else child.pid}
        try:
            if child is not None and child.returncode is None:
                if fd is not None:
                    if not exited(fd):
                        signal.pidfd_send_signal(fd, signal.SIGTERM)
                else:
                    # Popen-created, unreaped direct child only. Popen.terminate()
                    # polls/reaps first and never signals a recorded external PID.
                    child.terminate()
                child.wait(timeout=10)
            cleanup["normalExitOrAlreadyExited"] = True
        except BaseException as clean:
            cleanup["cleanupFailureCode"] = code(clean)
            cleanup["possiblyStillRunning"] = True
        write(ctx["event"] / ("readonly-cleanup-" + label + ".json"), cleanup)
        need("cleanupFailureCode" not in cleanup, "READONLY_CHILD_CLEANUP")
        raise Rejected(failure) from None
    finally:
        if child is not None and child.stdin is not None:
            try:
                child.stdin.close()
            except (OSError, ValueError):
                pass
        if fd is not None:
            os.close(fd)


def exact_tree(root, expected):
    """检查确切叶子与派生目录；不跟随 symlink，不扫描其他目录。"""
    expected = set(expected)
    directories = {""}
    for rel in expected:
        p = Path(rel).parent
        while str(p) != ".":
            directories.add(p.as_posix())
            p = p.parent
    leaves, seen_dirs, todo = set(), set(), [Path(root)]
    while todo:
        p = todo.pop()
        rel = p.relative_to(root).as_posix()
        rel = "" if rel == "." else rel
        s = p.lstat()
        need(s.st_uid == s.st_gid == UID, "TREE_OWNER")
        if not stat.S_ISLNK(s.st_mode):
            need(not s.st_mode & 0o022, "TREE_MODE")
        if stat.S_ISDIR(s.st_mode):
            need(rel in directories, "EXTRA_DIRECTORY")
            seen_dirs.add(rel)
            todo.extend(p.iterdir())
        else:
            need(rel in expected and (stat.S_ISREG(s.st_mode) or stat.S_ISLNK(s.st_mode)), "EXTRA_FILE")
            leaves.add(rel)
        need(len(todo) + len(leaves) + len(seen_dirs) <= len(expected) + len(directories), "TREE_BOUND")
    need(leaves == expected and seen_dirs == directories, "EXACT_TREE")


def verify_dependencies():
    manifest = pinned(ART.parent / "application-manifest.json", APP_SHA)
    rows = manifest["entries"]
    deps = {p: row for p, row in rows.items() if row["sourceKind"] == "dependency"}
    need(len(deps) == 13812, "DEPENDENCY_COUNT")
    need(sum("symlink" in row for row in deps.values()) == 295, "DEPENDENCY_LINK_COUNT")
    roots = ("node_modules", "apps/api/node_modules")
    need(all(any(p.startswith(root + "/") for root in roots) for p in deps), "DEPENDENCY_ROOTS")
    directories = {""}
    for rel in rows:
        p = Path(rel).parent
        while str(p) != ".":
            directories.add(p.as_posix())
            p = p.parent
    for root in roots:
        exact_tree(ART / root, {p[len(root) + 1:] for p in deps if p.startswith(root + "/")})
    for rel, row in deps.items():
        if "symlink" in row:
            p = ART / rel
            need(os.readlink(p) == row["symlink"] and not row.get("dangling"), "DEPENDENCY_LINK")
            target = p.resolve(strict=True)
            need(target.is_relative_to(ART), "DEPENDENCY_LINK_ESCAPE")
            target_rel = target.relative_to(ART).as_posix()
            need(target_rel in rows or target_rel in directories, "DEPENDENCY_LINK_CLOSURE")
    # 全部原文件 hash/mode/owner 已由原 m.installed(..., full=True) 检查。
    return {"entries": len(deps), "symlinks": 295, "allOriginalManifestFilesVerified": True}


def build_rows(build):
    need(
        build["kind"] == "API_ONLY_COMPILED_JS_PREPARATION"
        and build["identity"] == NEW_ID and build["deployed"] is False
        and build["webReuseCommit"] == ctx["old_id"]["sourceCommit"],
        "BUILD_IDENTITY",
    )
    rows = {}
    for row in build["files"]:
        rel = row["path"]
        need(
            isinstance(rel, str) and rel.endswith(".js") and not rel.startswith("/")
            and "\\" not in rel and all(p not in ("", ".", "..") for p in rel.split("/"))
            and rel not in rows and type(row["bytes"]) is int and 0 <= row["bytes"] <= 8 * 1024**2
            and re.fullmatch(r"[a-f0-9]{64}", row["sha256"]),
            "JS_ROW",
        )
        rows[rel] = row
    need(len(rows) == 256 and sum(r["bytes"] for r in rows.values()) == build["outputBytes"] == 2730705,
         "JS_TOTAL")
    return rows


def verify_js(root, rows):
    exact_tree(root, rows)
    for rel, row in rows.items():
        raw = read(root / rel, 8 * 1024**2)
        need(len(raw) == row["bytes"] and sha(raw) == row["sha256"], "JS_CONTENT")


def install(rows):
    verify_js(INPUT / "dist", rows)
    private_dir(ROOT, create=True)
    private_dir(DIST, create=True)
    private_dir(ROOT / "events", create=True)
    private_dir(ROOT / "private", create=True)
    for rel, row in rows.items():
        destination = DIST / rel
        destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        raw = read(INPUT / "dist" / rel, 8 * 1024**2)
        need(len(raw) == row["bytes"] and sha(raw) == row["sha256"], "COPY_SOURCE_CHANGED")
        with destination.open("xb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
    verify_js(DIST, rows)


JS_PREFLIGHT = r"""
'use strict';
try {
  const fs = require('node:fs'), path = require('node:path');
  const {createRequire,isBuiltin} = require('node:module');
  const {isDeepStrictEqual:eq} = require('node:util');
  const fail = () => { throw new Error('rejected'); };
  const check = x => { if (!x) fail(); };
  const [oldManifestPath,newManifestPath,art,dist] = process.argv.slice(1);
  const oldManifest = JSON.parse(fs.readFileSync(oldManifestPath,'utf8'));
  const build = JSON.parse(fs.readFileSync(newManifestPath,'utf8'));
  const oldRequire = createRequire(path.join(art,'apps/api/dist/main.js'));
  const oldFiles = new Set(Object.entries(oldManifest.entries)
    .filter(([,r]) => !Object.hasOwn(r,'symlink'))
    .map(([p]) => path.join(art,p)));
  const newFiles = new Set(build.files.map(r => path.join(dist,r.path)));
  const digest = x => require('node:crypto').createHash('sha256').update(x).digest('hex');
  let sites = 0;
  const bare = new Set();
  for (const row of build.files) {
    const filename = path.join(dist,row.path);
    const raw = fs.readFileSync(filename);
    check(raw.length === row.bytes && digest(raw) === row.sha256);
    const text = raw.toString('utf8');
    const calls = [...text.matchAll(/\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g)];
    check((text.match(/\brequire\s*\(/g)||[]).length === calls.length);
    check(!/\bimport\s*\(|\brequire\s*\.\s*resolve\s*\(/.test(text));
    const local = createRequire(filename);
    for (const call of calls) {
      const request = call[2]; sites++;
      if (isBuiltin(request)) continue;
      check(!path.isAbsolute(request));
      const resolved = fs.realpathSync(local.resolve(request));
      if (request.startsWith('.')) {
        check(newFiles.has(resolved));
      } else {
        bare.add(request);
        check(oldFiles.has(resolved));
        check(resolved === fs.realpathSync(oldRequire.resolve(request)));
      }
    }
  }
  check(sites === 1271 && bare.size === 14);
  const newRequire = createRequire(path.join(dist,'main.js'));
  const ni = newRequire('./common/build-identity.generated.js').IMMUTABLE_BUILD_IDENTITY;
  const oi = oldRequire('./common/build-identity.generated.js').IMMUTABLE_BUILD_IDENTITY;
  check(eq(ni,build.identity) && eq(oi,oldManifest.identity));
  const mapping = {
    EXPECTED_SOURCE_COMMIT:'sourceCommit', EXPECTED_SOURCE_TREE:'sourceTree',
    EXPECTED_RELEASE:'release', EXPECTED_BUILD_TIME:'buildTime'
  };
  const oldEnv = {...process.env};
  for (const [k,field] of Object.entries(mapping)) oldEnv[k] = oi[field];
  const nc = newRequire('./common/app-config.js');
  const oc = oldRequire('./common/app-config.js');
  check(typeof nc.resolveAppConfig === 'function' && typeof oc.resolveAppConfig === 'function');
  const fresh = nc.resolveAppConfig(process.env,ni);
  const prior = oc.resolveAppConfig(oldEnv,oi);
  for (const value of [fresh,prior]) {
    check(value.nodeEnv === 'production' && value.deploymentEnvironment === 'staging');
    check(value.port === 3591 && value.frontendUrl === 'https://localhost:45464');
    check(value.authMockEnabled === false && value.notificationQueueEnabled === false);
    check(value.notificationInAppReminderScanEnabled === false);
    check(value.malwareScannerProvider === 'clamav');
    check(value.attachmentStoragePurgedMetadataRetentionMs === 7776000000);
  }
  for (const key of ['sourceCommit','sourceTree','release','buildTime','runtimeCommit']) {
    delete fresh[key]; delete prior[key];
  }
  check(eq(fresh,prior));
  process.stdout.write('DEPENDENCIES_AND_EFFECTIVE_CONFIG_EQUAL\n');
} catch {
  process.exitCode = 2;
}
"""


def effective_config():
    old = ctx["old_env"]
    need(all(isinstance(k, str) and isinstance(v, str) for k, v in old.items()), "ENV_SHAPE")
    need(not {"NODE_OPTIONS", "NODE_PATH", "LD_PRELOAD"} & set(old), "ENV_INJECTION")
    new = dict(old)
    for key, field in EXPECTED.items():
        need(old.get(key) == ctx["old_id"][field], "OLD_EXPECTED_IDENTITY")
        new[key] = NEW_ID[field]
    need(
        set(new) == set(old)
        and all(new[k] == old[k] for k in old if k not in EXPECTED),
        "ENV_EXACT_DELTA",
    )
    ctx["new_env"] = new
    result = bounded(
        "config-preflight",
        [str(NODE), "--max-old-space-size=256", "-e", JS_PREFLIGHT,
         str(ART.parent / "application-manifest.json"), str(INPUT / "build-manifest.json"),
         str(ART), str(DIST)],
        {**ctx["base"].BASE_ENV, **new, "NODE_PATH": NODEPATH},
    )
    need(result == b"DEPENDENCIES_AND_EFFECTIVE_CONFIG_EQUAL\n", "CONFIG_PREFLIGHT")


SQL = r"""
BEGIN TRANSACTION READ ONLY;
SELECT json_build_object(
'database',current_database(),'address',inet_server_addr()::text,'port',inet_server_port(),
'role',current_user,'readOnly',current_setting('transaction_read_only'),
'retentionIntervalExactMs',EXTRACT(EPOCH FROM make_interval(secs=>7776000))*1000,
'unfinishedStates',(SELECT count(*) FROM public.attachment_storage_reservations
 WHERE state::text IN ('RESERVED','PURGING','RECONCILIATION_REQUIRED')),
'expiredPurged',(SELECT count(*) FROM public.attachment_storage_reservations
 WHERE state::text='PURGED' AND "purgedAt"<now()-make_interval(secs=>7776000)),
'purgedBecomingEligibleNext24h',(SELECT count(*) FROM public.attachment_storage_reservations
 WHERE state::text='PURGED' AND "purgedAt">=now()-make_interval(secs=>7776000)
 AND "purgedAt"<now()+interval '24 hours'-make_interval(secs=>7776000)),
'totalReservationRows',(SELECT count(*) FROM public.attachment_storage_reservations));
COMMIT;
"""


def quota(label):
    u = urlsplit(ctx["old_env"]["DATABASE_URL"])
    need(
        u.hostname == "127.0.0.1" and u.port == 5432
        and u.username == "truck_color_app" and u.path == "/truck_color_recovery_r24_20261025"
        and u.password is not None,
        "DATABASE_TARGET",
    )
    env = {
        "PATH": "/usr/bin:/bin", "HOME": "/home/recovery", "LANG": "C.UTF-8",
        "PGPASSWORD": unquote(u.password), "PGCONNECT_TIMEOUT": "5",
        "PGOPTIONS": "-c default_transaction_read_only=on -c statement_timeout=10000 -c lock_timeout=1000",
    }
    raw = bounded(
        "quota-" + label,
        ["/usr/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1", "--inhibit-cache",
         "--library-path", LIBPATH,
         "/home/recovery/runtime-debs-r30-r02/usr/lib/postgresql/14/bin/psql",
         "-h", "127.0.0.1", "-p", "5432", "-U", "truck_color_app",
         "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1",
         "-d", "truck_color_recovery_r24_20261025", "-f", "-"],
        env, SQL.encode(),
    )
    value = json.loads(raw)
    need(
        value["database"] == "truck_color_recovery_r24_20261025"
        and value["address"] == "127.0.0.1/32" and value["port"] == 5432
        and value["role"] == "truck_color_app" and value["readOnly"] == "on"
        and value["retentionIntervalExactMs"] == 7776000000,
        "QUOTA_IDENTITY",
    )
    report = {
        "at": now(), "phase": label, "query": value, "queryReadOnly": True,
        "effectiveRetentionMs": 7776000000, "totalRowCountIsAdmissionCondition": False,
    }
    write(ctx["event"] / ("quota-" + label + ".json"), report)
    need(all(value[k] == 0 for k in (
        "unfinishedStates", "expiredPurged", "purgedBecomingEligibleNext24h"
    )), "QUOTA_THREE_ZERO")
    return report



def resources(starting=False, phase=None):
    a, m = ctx["args"], ctx["m"]
    phases = {
        "prepare": True, "switch-pre-stop": True, "switch-post-stop": True,
        "switch-post-verify": False, "rollback-pre-stop": True,
        "rollback-prestart": True, "rollback-postverify": False,
    }
    need(phase in phases and starting is phases[phase] and a.budget_channel_stdio, "BUDGET_PHASE")
    seen = ctx.setdefault("budgetPhases", set())
    need(phase not in seen, "BUDGET_REQUEST_REPLAY")
    seen.add(phase)
    request_id = a.event + ":" + phase
    ticks, uid, state = stat_owner(os.getpid())
    need(uid == UID and state != "Z", "BUDGET_CONTROLLER_OWNER")
    print(json.dumps({
        "status": "NEED_BUDGET", "protocol": "A09_BUDGET_STDIO_V1",
        "requestId": request_id, "phase": phase, "starting": starting,
        "bootId": BOOT, "guestPid": os.getpid(), "guestStartTicks": ticks,
    }, separators=(",", ":")), flush=True)
    poller = select.poll()
    poller.register(0, select.POLLIN | select.POLLHUP | select.POLLERR)
    until = time.monotonic() + 120
    raw = b""
    while b"\n" not in raw:
        remaining = until - time.monotonic()
        need(remaining > 0, "BUDGET_REPLY_TIMEOUT")
        ready = poller.poll(max(1, int(remaining * 1000)))
        need(bool(ready), "BUDGET_REPLY_TIMEOUT")
        chunk = os.read(0, 4097 - len(raw))
        need(bool(chunk), "BUDGET_CHANNEL_CLOSED")
        raw += chunk
        need(len(raw) <= 4096, "BUDGET_REPLY_BOUND")
    need(raw.count(b"\n") == 1 and raw.endswith(b"\n"), "BUDGET_REPLY_FRAMING")
    reply = json.loads(raw)
    need(reply.get("requestId") == request_id and reply.get("phase") == phase
         and reply.get("protocol") == "A09_BUDGET_STDIO_V1", "BUDGET_REPLY_BINDING")
    need(reply.get("status") == "BUDGET_READY", "HOST_BUDGET_REJECTED")
    need(set(reply) == {"status", "protocol", "requestId", "phase", "sha256"}, "BUDGET_REPLY_SCHEMA")
    digest = reply["sha256"]
    b = pinned(INPUT / ("budget-" + digest + ".json"), digest, 4 * 1024**2)
    paths = [r["path"] for r in b["rows"]]
    expected = ctx["pins"]["budgetRootPaths"]
    policy = ctx["pins"].get("hostBudgetPolicy")
    count = len(expected)
    need(
        (376 <= count <= 4096 if policy else count == 376)
        and len(paths) == len(set(paths)) == count == len(set(expected))
        and HOST_PREPARATION in paths
        and (paths == expected == policy.get("expectedRootPaths") if policy
             else set(paths) == set(expected)),
        "COMPLETE_NEW_BUDGET_ROOTS",
    )
    # 每次重新得到外部摘要；原 120 秒/24 GiB/guest 1 GiB/reserve 规则不改。
    mv = types.SimpleNamespace(**m.__dict__)
    mv.INPUT = INPUT
    old = ctx["observe"].resources(mv, ctx["base"], digest, starting)
    new = ctx["observe"].resources(
        mv, types.SimpleNamespace(LOGS=ROOT / "private"), digest, starting
    )
    return {"requestId": request_id, "budgetSha256": digest, "originalLogs": old, "overlayLogs": new}


def stat_owner(pid):
    p = Path("/proc") / str(pid)
    fields = (p / "stat").read_text().rsplit(") ", 1)[1].split()
    return fields[19], p.stat().st_uid, fields[0]


def retained():
    boot()
    b = ctx["base"]
    for pid, ticks, uid in SHARED:
        actual_ticks, actual_uid, state = stat_owner(pid)
        need((actual_ticks, actual_uid) == (ticks, uid) and state != "Z", "SHARED_OWNER_CHANGED")
    for role in ("web", "proxy"):
        need(b.matches(ctx["old_owners"][role]), "RETAINED_OWNER_CHANGED")
    rows = [r for r in b.listeners() if r["port"] in (3592, 45464)]
    need(sorted(rows, key=lambda r: r["port"]) == ctx["retained_listeners"], "RETAINED_LISTENER_CHANGED")


def api_free():
    return not any(r["port"] == 3591 for r in ctx["base"].listeners())


def api_listener(owner):
    b = ctx["base"]
    need(b.matches(owner), "API_OWNER")
    rows = [r for r in b.listeners() if r["port"] == 3591]
    sockets = set()
    for fd in Path("/proc", str(owner["pid"]), "fd").iterdir():
        try:
            name = os.readlink(fd)
            if name.startswith("socket:["):
                sockets.add(name[8:-1])
        except FileNotFoundError:
            pass
    need(
        len(rows) == 1 and rows[0]["family"] == "tcp"
        and rows[0]["address"] == "0100007F" and rows[0]["inode"] in sockets,
        "API_LISTENER",
    )


def stop_api(owner, require_listener=True):
    """不得调用原 stop_owned：它要求全部三个端口关闭。"""
    boot()
    b = ctx["base"]
    need(
        owner["uid"] == UID and owner["executable"] == str(NODE)
        and owner["cwd"] in (str(ART / "apps/api"), str(ROOT)),
        "STOP_SCOPE",
    )
    try:
        fd = os.pidfd_open(owner["pid"])
    except ProcessLookupError:
        need(api_free(), "API_PORT_NOT_FREE")
        return {"alreadyExited": True}
    try:
        if not exited(fd):
            need(b.matches(owner), "STOP_OWNER")
            if require_listener:
                api_listener(owner)
            boot()
            need(b.matches(owner), "STOP_OWNER_RECHECK")
            signal.pidfd_send_signal(fd, signal.SIGTERM)
        wait_exit(fd, 45)
        need(api_free(), "API_PORT_NOT_FREE")
        return {"pid": owner["pid"], "startTicks": owner["startTicks"], "normalExit": True}
    finally:
        os.close(fd)


def spawn_api(fresh, label):
    boot()
    retained()
    need(api_free(), "API_PORT_OCCUPIED")
    b = ctx["base"]
    cwd = ROOT if fresh else ART / "apps/api"
    env = {**b.BASE_ENV, **(ctx["new_env"] if fresh else ctx["old_env"])}
    if fresh:
        env["NODE_PATH"] = NODEPATH
    argv = [str(NODE), "--max-old-space-size=512", str(DIST / "main.js") if fresh else "dist/main.js"]
    with (ctx["logs"] / (label + ".log")).open("xb") as stream:
        child = subprocess.Popen(
            argv, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
            stdout=stream, stderr=subprocess.STDOUT, close_fds=True,
            start_new_session=True, preexec_fn=lambda: limits(4 * 1024**2),
        )
    # 先保存 child，再开 pidfd；未 reap 的本次 child PID 不会被复用。
    ctx["spawned"] = {"child": child, "fd": None}
    ctx["spawned"]["fd"] = os.pidfd_open(child.pid)
    owner = b.proc_record(child.pid)
    need(
        owner["uid"] == UID and owner["executable"] == str(NODE) and owner["cwd"] == str(cwd),
        "NEW_API_OWNER",
    )
    ctx["spawned"]["owner"] = owner
    write(ctx["event"] / (label + "-owner.json"), owner)
    until = time.monotonic() + 60
    while time.monotonic() < until:
        need(child.poll() is None, "NEW_API_EARLY_EXIT")
        try:
            api_listener(owner)
            return owner
        except Rejected as exc:
            if str(exc) != "CHECK_API_LISTENER":
                raise
        time.sleep(0.2)
    raise Rejected("CHECK_NEW_API_READY_TIMEOUT")


def cleanup_spawned():
    """不经过 config/quota/budget/maps 准入；仅清理本控制器创建的 child。"""
    spawned = ctx.get("spawned")
    if not spawned:
        return
    child, fd = spawned["child"], spawned["fd"]
    if fd is None:
        fd = os.pidfd_open(child.pid)
        spawned["fd"] = fd
    boot()
    if not exited(fd):
        signal.pidfd_send_signal(fd, signal.SIGTERM)
        wait_exit(fd, 45)
    child.wait(timeout=1)
    os.close(fd)
    ctx["spawned"] = None
    need(api_free(), "CLEANUP_API_PORT_NOT_FREE")


def release_child_handle():
    spawned = ctx.get("spawned")
    if spawned and spawned["fd"] is not None:
        os.close(spawned["fd"])
    ctx["spawned"] = None


def composite(owner, fresh):
    retained()
    b = ctx["base"]
    owners = {**ctx["old_owners"], "api": owner}
    b.assert_listeners(owners)
    identities = {}
    for role, port, path, tls, expected in (
        ("directApi", 3591, "/api/health", False, NEW_ID if fresh else ctx["old_id"]),
        ("tlsApi", 45464, "/api/health", True, NEW_ID if fresh else ctx["old_id"]),
        ("directWeb", 3592, "/build-info", False, ctx["old_id"]),
        ("tlsWeb", 45464, "/build-info", True, ctx["old_id"]),
    ):
        actual = b.identity_probe(port, path, tls)
        need(
            all(actual.get(k) == v for k, v in expected.items())
            and actual.get("runtimeCommit") == expected["sourceCommit"],
            "COMPOSITE_IDENTITY",
        )
        need(
            actual.get("service") == ("feishu-timeline-api" if "Api" in role else "feishu-timeline-web")
            and ("Api" not in role or actual.get("status") == "ok"),
            "COMPOSITE_HEALTH",
        )
        identities[role] = {k: actual[k] for k in expected}
    view = types.SimpleNamespace(
        PORTS=b.PORTS, matches=b.matches,
        run_dir=lambda _: ctx["event"], owners_for=lambda _: owners,
    )
    maps = ctx["observe"].maps(ctx["m"], view, ctx["args"].event, ctx["native"])
    retained()
    return {"identities": identities, "maps": maps, "owners": owners}



def restore_old():
    retained()
    need(api_free(), "ROLLBACK_API_PORT_OCCUPIED")
    resources(True, "rollback-prestart")
    try:
        owner = spawn_api(False, "restored-api")
        observed = composite(owner, False)
        quota("restored")
        resources(False, "rollback-postverify")
        release_child_handle()
        return {"status": "ORIGINAL_API_RESTORED", "apiOwner": owner, **observed}
    except BaseException as original:
        ctx["restoreFailure"] = {"restorationFailureCode": code(original)}
        try:
            cleanup_spawned()
        except BaseException as cleanup:
            ctx["restoreFailure"]["restorationCleanupFailureCode"] = code(cleanup)
        raise


def initialize(a):
    boot()
    pins = pinned(INPUT / "pins.json", a.pins_sha256, 256 * 1024)
    need(
        pins["kind"] == "A09_API_ONLY_OVERLAY_V1" and pins["executionAllowed"] is True,
        "EXECUTION_NOT_APPROVED",
    )
    need(sha(read(Path(__file__), 256 * 1024)) == pins["helperSha256"], "SELF_EXTERNAL_PIN")
    need(a.build_manifest_sha256 == pins["buildManifestSha256"] == BUILD_SHA, "BUILD_EXTERNAL_PIN")
    need(pins.get("budgetProtocol") == "A09_BUDGET_STDIO_V1", "BUDGET_PROTOCOL_PIN")
    m = module(LEGACY / "preview-common.py", COMMON_SHA, "overlay_common")
    old_pins, plan = m.load(LEGACY_PINS_SHA)
    rv = module(
        LEGACY / "runtime-preview.py",
        old_pins["files"]["runtime-preview.py"]["sha256"], "overlay_legacy_runtime",
    )
    rv.m, rv.plan = m, plan
    rv.PINS_SHA, rv.MANIFEST_SHA, rv.COPY_SHA = LEGACY_PINS_SHA, APP_SHA, ASSEMBLY_SHA
    rv.initialize(False)  # 不调用 main / handoff / scanner lifecycle。
    _, old_id, old_env = rv.validate_existing_configuration()
    ctx.update(args=a, pins=pins, m=m, base=rv.base, observe=rv.observe,
               native=rv.NATIVE_PROOF, old_id=old_id, old_env=old_env, spawned=None)
    old_start = pinned(OLD_START, OLD_START_SHA, 65536)
    owners = old_start["owners"]
    need(old_start["identity"] == old_id, "ORIGINAL_START_IDENTITY")
    fixed = {"api": (2502, "343663", ART / "apps/api"),
             "web": (2503, "343664", ART / "runtime/apps/web"),
             "proxy": (2510, "343664", R)}
    for role, (pid, ticks, cwd) in fixed.items():
        owner = owners[role]
        need(
            owner["pid"] == pid and owner["startTicks"] == ticks
            and owner["uid"] == UID and owner["executable"] == str(NODE) and owner["cwd"] == str(cwd),
            "ORIGINAL_OWNER_BINDING",
        )
    ctx["old_owners"] = owners
    ctx["retained_listeners"] = sorted(
        [r for r in rv.base.listeners() if r["port"] in (3592, 45464)],
        key=lambda r: r["port"],
    )
    need(len(ctx["retained_listeners"]) == 2, "RETAINED_LISTENERS")
    retained()
    for root in (ART, ART / "apps/api", ART / "runtime/apps/web"):
        for name in (".env", ".env.local", ".env.production", ".env.production.local"):
            need(not (root / name).exists() and not (root / name).is_symlink(), "NO_DOTENV")
    ctx["dependencies"] = verify_dependencies()
    return build_rows(pinned(INPUT / "build-manifest.json", BUILD_SHA))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--execute-reviewed", action="store_true")
    p.add_argument("--pins-sha256")
    p.add_argument("--build-manifest-sha256")
    p.add_argument("--budget-channel-stdio", action="store_true")
    p.add_argument("--event")
    p.add_argument("--start-receipt")
    p.add_argument("--start-receipt-sha256")
    p.add_argument("phase", nargs="?", choices=("switch", "rollback"), default="switch")
    a = p.parse_args()
    if not a.execute_reviewed:
        print(json.dumps({
            "status": "PLAN_ONLY", "component": "api", "port": 3591,
            "preservedPorts": [3592, 45464], "target": str(ROOT),
            "wholePackageCandidate": False,
        }))
        return
    need(re.fullmatch(r"[a-z0-9][a-z0-9-]{0,47}", a.event or ""), "EVENT")
    need(all(re.fullmatch(r"[a-f0-9]{64}", v or "") for v in (
        a.pins_sha256, a.build_manifest_sha256
    )), "EXTERNAL_ARGUMENTS")
    need(a.budget_channel_stdio, "BUDGET_CHANNEL_REQUIRED")
    rows = initialize(a)
    resources(True, "prepare")
    if a.phase == "switch":
        need(ctx["base"].matches(ctx["old_owners"]["api"]), "ORIGINAL_API_NOT_CURRENT")
        install(rows)
    else:
        private_dir(ROOT)
        private_dir(ROOT / "events")
        private_dir(ROOT / "private")
    ctx["event"] = ROOT / "events" / a.event
    ctx["logs"] = ROOT / "private" / a.event
    private_dir(ctx["event"], create=True)
    private_dir(ctx["logs"], create=True)
    write(ctx["event"] / "claim.json", {
        "at": now(), "kind": "A09_API_ONLY_OVERLAY_V1", "phase": a.phase,
        "bootId": BOOT, "pinsSha256": a.pins_sha256, "buildManifestSha256": BUILD_SHA,
        "originalStartReceiptSha256": OLD_START_SHA, "target": str(ROOT),
        "wholePackageCandidate": False, "privateEnvironmentPublished": False,
    })
    stopped = False
    report = {"at": now(), "bootId": BOOT, "target": str(ROOT),
              "pinsSha256": a.pins_sha256, "buildManifestSha256": BUILD_SHA,
              "wholePackageCandidate": False}
    try:
        if a.phase == "switch":
            effective_config()
            report["before"] = composite(ctx["old_owners"]["api"], False)
            report["quotaPre"] = quota("pre")
            report["resourcePre"] = resources(True, "switch-pre-stop")
            retained()
            stopped = True
            report["originalApiStop"] = stop_api(ctx["old_owners"]["api"])
            resources(True, "switch-post-stop")
            owner = spawn_api(True, "overlay-api")
            report["after"] = composite(owner, True)
            report["quotaPost"] = quota("post")
            report["resourcePost"] = resources(False, "switch-post-verify")
            verify_js(DIST, rows)
            report.update(status="API_ONLY_PREVIEW_RUNNING", identity=NEW_ID, apiOwner=owner,
                          dependencies=ctx["dependencies"], finishedAt=now())
            digest = write(ctx["event"] / "result.json", report)
            release_child_handle()
        else:
            path = canonical(a.start_receipt)
            need(path.is_relative_to(ROOT / "events") and path.name == "result.json", "ROLLBACK_RECEIPT_PATH")
            started = pinned(path, a.start_receipt_sha256, 2 * 1024**2)
            need(
                started["status"] == "API_ONLY_PREVIEW_RUNNING" and started["bootId"] == BOOT
                and started["target"] == str(ROOT) and started["identity"] == NEW_ID
                and started["pinsSha256"] == a.pins_sha256
                and started["buildManifestSha256"] == BUILD_SHA,
                "ROLLBACK_RECEIPT_BINDING",
            )
            owner = started["apiOwner"]
            need(owner["cwd"] == str(ROOT), "ROLLBACK_OWNER_SCOPE")
            retained()
            # 故障 API 可无 listener/health/maps；精确归属仍由 stop_api 双检。
            report["before"] = {"apiOwner": owner, "healthAndMapsRequiredForStop": False}
            report["quotaPre"] = quota("pre")
            resources(True, "rollback-pre-stop")
            report["overlayApiStop"] = stop_api(owner, require_listener=False)
            stopped = True
            report["restoration"] = restore_old()
            report.update(status="ORIGINAL_API_RESTORED", finishedAt=now())
            digest = write(ctx["event"] / "result.json", report)
        print(json.dumps({"status": report["status"], "path": str(ctx["event"] / "result.json"),
                          "sha256": digest}))
    except BaseException as exc:
        report.update(status="FAILED_PRESERVED", failureCode=code(exc), failedAt=now())
        try:
            cleanup_spawned()
            report["createdApiCleanup"] = "NORMAL_EXIT_OR_ALREADY_EXITED"
        except BaseException as cleanup:
            report["cleanupFailureCode"] = code(cleanup)
        if stopped and a.phase == "switch" and not report.get("cleanupFailureCode"):
            try:
                if api_free():
                    report["restoration"] = restore_old()
                else:
                    report["restoration"] = {"status": "NOT_ATTEMPTED_API_PORT_NOT_FREE"}
            except BaseException as recovery:
                report["restorationFailureCode"] = code(recovery)
        if "restoreFailure" in ctx:
            report["restorationFailureDetails"] = ctx["restoreFailure"]
        report["finishedAt"] = now()
        digest = write(ctx["event"] / "result.json", report)
        print(json.dumps({"status": "FAILED_PRESERVED", "code": report["failureCode"],
                          "path": str(ctx["event"] / "result.json"), "sha256": digest}))
        raise SystemExit(1)


if __name__ == "__main__":
    os.umask(0o077)
    try:
        main()
    except Exception as exc:
        print(json.dumps({"status": "FAILED_PRESERVED", "code": code(exc)}))
        raise SystemExit(1)
