#!/usr/bin/env python3
"""Observe an already handed-off scanner without owning or stopping it.

Uses the reviewed scanner's verification functions and immutable inputs. Its
launch-window cleanup is deliberately not called: A2 only owns its four children.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
import types

SOURCE = Path('/home/recovery/input-scanner-healthy-r30-r04/install_scanner.py')
SOURCE_SHA = '2cfe22db63f62abc20067bf498ca34a45e2b0e83391cc6a42ea836a4e8d19f8c'


def observe(args):
    raw=SOURCE.read_bytes()
    if len(raw)>128*1024 or hashlib.sha256(raw).hexdigest()!=SOURCE_SHA:
        raise RuntimeError('CHECK_SCANNER_COMPONENT_PIN')
    m=types.ModuleType('shared_scanner_reference');m.__file__=str(SOURCE)
    exec(compile(raw,str(SOURCE),'exec'),m.__dict__)
    m.need(sys.flags.isolated and sys.platform=='linux' and m.platform.machine() in ('aarch64','arm64') and
           m.os.getuid()==m.os.getgid()==1100,'READONLY_GUEST')
    m.os.umask(0o077)
    m.configure_target(args.target_sha256)
    m.JOINT_SHA=m.digest(args.content_sha256);m.BUDGET_SHA=m.digest(args.budget_sha256);m.PREP_SHA=m.digest(args.preparation_sha256)
    m.need(re.fullmatch('(?:a2|resume)-[a-z0-9-]{1,48}',args.event),'A2_EVENT_NAME')
    m.REPORT.update(kind='OFFLINE_SCANNER_HEALTHY_FIRST_START',phase='verify',startedAt=m.now(),identity=m.IDENTITY,
        jointDeliveryBinding=m.joint_check(),packagePinFileSha256=m.PIN_SHA,packageBinding=m.pins(),forceKill=False,
        appOrDatabaseAccess=False,signatureUpdates=False,sourceChanges=False,windowBytes=m.WINDOW_BYTES,
        preparationSha256=m.PREP_SHA,configSha256=m.CONFIG_SHA,scannerTarget=str(m.OFFLINE),currentBootId=m.BOOT,
        controllerKind='SHARED_SCANNER_READONLY_CHECK',verificationComponentSha256=SOURCE_SHA,
        sharedScannerStopAllowed=False)
    # No execute(), observe(), start(), stop(), signal handler or cleanup path is used.
    m.data_baseline();m.fixed_owners();m.directory(m.SCANNER);m.directory(m.EVENTS);m.directory(m.LOGS)
    m.OUT=m.EVENTS/('verify-'+args.event);m.OUT.mkdir(mode=0o700)
    try:
        m.budget();m.prepared();index,checked=m.package();m.CURRENT_INDEX=index;m.resources()
        m.verify(args.run,args.start_sha256,index)
    except BaseException as error:
        m.REPORT.update(status='SHARED_SCANNER_READBACK_FAILED_NO_SERVICE_ACTION',errorType=type(error).__name__,
            errorCode=str(error) if isinstance(error,RuntimeError) and re.fullmatch('CHECK_[A-Z0-9_]+',str(error)) else type(error).__name__)
        raise
    finally:
        m.REPORT['finishedAt']=m.now();receipt=m.OUT/'receipt.json';pin=m.write_new(receipt,m.REPORT)
        print(json.dumps({'status':m.REPORT.get('status'),'receipt':str(receipt),'sha256':pin,'sharedScannerStopAllowed':False}))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--execute',action='store_true')
    for name in ('target-sha256','content-sha256','budget-sha256','preparation-sha256','start-sha256','run','event'):
        parser.add_argument('--'+name,required=True)
    args=parser.parse_args()
    if not args.execute:print(json.dumps({'status':'PLAN_ONLY'}))
    else:
        try:observe(args)
        except Exception:raise SystemExit(1)
