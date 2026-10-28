"""Pure bounded lifecycle regressions. No VM, service, private data or real TLS."""
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import Mock, patch


def module(name):
    path=Path(__file__).with_name(name+'.py');spec=importlib.util.spec_from_file_location(name,path)
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result


lifecycle=module('instance_lifecycle');processes=module('instance_processes');scanner=module('instance_scanner')


class FakeSocket:
    def __init__(self, response):self.stream=io.BytesIO(response);self.sent=[]
    def __enter__(self):return self
    def __exit__(self,*args):return False
    def makefile(self,mode):return self.stream
    def settimeout(self,value):pass
    def sendall(self,value):self.sent.append(value)


class LifecycleTests(unittest.TestCase):
    def tearDown(self):lifecycle.ctx.clear()

    def test_durable_configuration_survives_new_boot_without_rewriting_provenance(self):
        old_boot='2552886b-e854-4f99-8b4e-bd307d8ddb92'
        new_boot='9fee751f-120b-451e-9b1b-b17eac34bf98'
        generation={'instance':lifecycle.INSTANCE,'software':'/home/recovery/software',
                    'dependencies':'/home/recovery/dependencies','bootId':old_boot}
        configuration={k:v for k,v in generation.items() if k!='dependencies'}
        runtime={**generation,'bootId':new_boot}
        lifecycle.configuration_origin(configuration,generation,runtime)
        self.assertEqual(configuration['bootId'],old_boot)
        for changes in ({'bootId':new_boot},{'software':'/home/recovery/other'}, {'instance':'/home/recovery/other'}):
            with self.subTest(changes=changes),self.assertRaisesRegex(RuntimeError,'GENERATION_BINDING'):
                lifecycle.configuration_origin({**configuration,**changes},generation,runtime)

    def test_plan_does_not_read_any_binding(self):
        p=subprocess.run([sys.executable,'-I','-B',lifecycle.__file__,'start','test'],capture_output=True,text=True)
        self.assertEqual(p.returncode,0);self.assertEqual(json.loads(p.stdout),{'status':'PLAN_ONLY'})

    def test_four_identities_use_all_selected_ports(self):
        ident={'sourceCommit':'a'*40,'sourceTree':'b'*40,'release':'candidate','buildTime':'date'}
        calls=[]
        def probe(port,path,tls):
            calls.append((port,path,tls));return {**ident,'runtimeCommit':ident['sourceCommit'],
                'service':'feishu-timeline-api' if path=='/api/health' else 'feishu-timeline-web','status':'ok'}
        with patch.object(processes,'PORTS',{'api':3594,'web':3595,'proxy':45474}),patch.object(processes,'COMMIT',ident['sourceCommit']),patch.object(processes,'identity_probe',probe):
            self.assertEqual(set(processes.four_identities(ident)),{'directApi','directWeb','tlsApi','tlsWeb'})
        self.assertEqual([x[0] for x in calls],[3594,3595,45474,45474])

    def test_redis_reader_authenticates_and_closes_stream(self):
        sock=FakeSocket(b'+OK\r\n+PONG\r\n')
        lifecycle.ctx.update(redisPassword='synthetic-fixture-password',redisOwner={'pid':9})
        with patch.object(lifecycle,'redis_listener'),patch.object(lifecycle.socket,'create_connection',return_value=sock):
            self.assertEqual(lifecycle.redis_call('PING'),'PONG')
        self.assertTrue(sock.stream.closed);self.assertEqual(len(sock.sent),2)

    def test_redis_reader_rejects_error_overflow_and_nested_arrays(self):
        lifecycle.ctx.update(redisPassword='synthetic-fixture-password',redisOwner={'pid':9})
        for response in [b'+OK\r\n-ERR failure\r\n',b'+OK\r\n$32769\r\n',b'+OK\r\n*1\r\n*1\r\n+bad\r\n',b'+OK\r\n'+b'+'+b'x'*1025+b'\r\n']:
            sock=FakeSocket(response)
            with self.subTest(response_kind=response[:12]),patch.object(lifecycle,'redis_listener'),patch.object(lifecycle.socket,'create_connection',return_value=sock):
                with self.assertRaises(RuntimeError):lifecycle.redis_call('PING')
            self.assertTrue(sock.stream.closed)

    def test_redis_mutating_commands_are_rejected_before_connection(self):
        with patch.object(lifecycle.socket,'create_connection') as connect:
            for command in ('FLUSHALL','SET','CONFIG SET','SHUTDOWN'):
                with self.assertRaises(RuntimeError):lifecycle.redis_call(command)
            connect.assert_not_called()

    def test_redis_late_bulk_is_not_accepted(self):
        clock=[0]
        class LateBulk(io.BytesIO):
            def read(self,size=-1):
                clock[0]=6
                return super().read(size)
        sock=FakeSocket(b'');sock.stream=LateBulk(b'+OK\r\n$4\r\nPONG\r\n')
        lifecycle.ctx.update(redisPassword='synthetic-fixture-password',redisOwner={'pid':9})
        with patch.object(lifecycle.time,'monotonic',lambda:clock[0]),patch.object(lifecycle,'redis_listener'),patch.object(lifecycle.socket,'create_connection',return_value=sock):
            with self.assertRaisesRegex(RuntimeError,'RESP_BULK'):lifecycle.redis_call('PING')
        self.assertTrue(sock.stream.closed)

    def test_wrong_redis_owner_fails_before_socket_inspection(self):
        lifecycle.ctx['p']=types.SimpleNamespace(matches=lambda _:False)
        with self.assertRaisesRegex(RuntimeError,'OWN_REDIS_PROCESS'):lifecycle.redis_listener({'pid':9})

    def setup_stop(self, root, owners, *, success=True):
        event=root/'events'/'run';event.mkdir(parents=True)
        runs=root/'runs';(runs/'run').mkdir(parents=True)
        (runs/'run'/'claim.json').write_text('{}')
        claim={'bindingSha256':'c'*64,'bootId':'boot','instance':lifecycle.INSTANCE}
        (event/'claim.json').write_text(json.dumps(claim))
        redis=owners.get('redis')
        if redis:(event/'redis-owner.json').write_text(json.dumps(redis))
        (event/'result.json').write_text('{}')
        writes=[]
        m=types.SimpleNamespace(pinned=lambda *_:claim,read=lambda p,*_:p.read_bytes(),write_new=lambda p,v:writes.append((p,v)))
        p=types.SimpleNamespace(RUNS=runs,owners_for=lambda _: {k:v for k,v in owners.items() if k!='redis'},stop_owned=Mock(return_value=[]))
        binding={'bootId':'boot','configurationReceipt':{'path':'public','sha256':'d'*64},'preservedOwners':{'old':{'pid':100}}}
        lifecycle.ctx.update(m=m,p=p,binding=binding,bindingSha='c'*64,event=event,run='run',stopping=True,startReceiptSha256='e'*64)
        actual={'status':'A2_FOUR_PROCESSES_STARTED_AND_VERIFIED' if success else 'FAILED','run':'run','bootId':'boot',
                'owners':owners,'configurationReceipt':binding['configurationReceipt']}
        return actual,p,writes

    def test_stop_refuses_shared_owner_without_signaling(self):
        with tempfile.TemporaryDirectory() as temporary:
            actual,p,writes=self.setup_stop(Path(temporary),{'api':{'pid':100}})
            with patch.object(lifecycle,'raw_public',return_value=json.dumps(actual).encode()),patch.object(lifecycle,'redis_stop') as redis:
                with self.assertRaisesRegex(RuntimeError,'SHARED_OWNER_CANNOT_BE_STOPPED'):lifecycle.stop('normal')
                p.stop_owned.assert_not_called();redis.assert_not_called()
            self.assertEqual(writes[-1][1]['status'],'STOP_FAILED_PRESERVED_NO_FORCE_KILL')

    def test_stop_requires_successful_exact_start_receipt(self):
        with tempfile.TemporaryDirectory() as temporary:
            actual,p,_=self.setup_stop(Path(temporary),{'api':{'pid':200}},success=False)
            with patch.object(lifecycle,'raw_public',return_value=json.dumps(actual).encode()):
                with self.assertRaisesRegex(RuntimeError,'ACTUAL_OWN_FOUR_START'):lifecycle.stop('normal')
            p.stop_owned.assert_not_called()

    def test_normal_stop_ignores_private_health_and_admission(self):
        with tempfile.TemporaryDirectory() as temporary:
            owners={'api':{'pid':201},'web':{'pid':202},'proxy':{'pid':203},'redis':{'pid':204}}
            actual,p,writes=self.setup_stop(Path(temporary),owners)
            with patch.object(lifecycle,'raw_public',return_value=json.dumps(actual).encode()),patch.object(lifecycle,'redis_stop',return_value={'pidfdExited':True}) as redis,patch.object(lifecycle,'preserved'),patch.object(lifecycle,'resource_guard',side_effect=AssertionError('must not gate stop')),patch.object(lifecycle,'validate_configuration',side_effect=AssertionError('must not read private config')):
                result=lifecycle.stop('normal')
            self.assertEqual(result['status'],'OWN_NEW_INSTANCE_PROCESSES_NORMAL_STOPPED')
            p.stop_owned.assert_called_once();redis.assert_called_once_with(owners['redis'])
            self.assertFalse(result['dataDeleted']);self.assertFalse(result['sharedServicesStopped'])

    def test_first_node_failure_still_stops_captured_redis(self):
        owner={'pid':204,'startTicks':'99'};lifecycle.ctx['redisOwner']=owner
        with patch.object(lifecycle,'stop',side_effect=RuntimeError('CHECK_OWNERSHIP_RECORDS_REQUIRED')),patch.object(lifecycle,'redis_stop',return_value={'pidfdExited':True}) as redis:
            result=lifecycle.cleanup_failed_start()
        redis.assert_called_once_with(owner)
        self.assertEqual(result['cleanupErrorCode'],'CHECK_OWNERSHIP_RECORDS_REQUIRED')
        self.assertTrue(result['independentRedisCleanup']['pidfdExited'])

    def test_application_stop_failure_does_not_skip_redis(self):
        with tempfile.TemporaryDirectory() as temporary:
            owners={'api':{'pid':201},'web':{'pid':202},'proxy':{'pid':203},'redis':{'pid':204}}
            actual,p,writes=self.setup_stop(Path(temporary),owners)
            p.stop_owned.side_effect=RuntimeError('CHECK_GRACEFUL_STOP_TIMEOUT_NO_FORCE_KILL')
            with patch.object(lifecycle,'raw_public',return_value=json.dumps(actual).encode()),patch.object(lifecycle,'redis_stop',return_value={'pidfdExited':True}) as redis:
                with self.assertRaisesRegex(RuntimeError,'OWN_STOP_INCOMPLETE'):lifecycle.stop('normal')
            redis.assert_called_once_with(owners['redis']);self.assertEqual(writes[-1][1]['status'],'STOP_FAILED_PRESERVED_NO_FORCE_KILL')

    def test_all_dotenv_variants_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);(root/'apps/api').mkdir(parents=True);(root/'runtime/apps/web').mkdir(parents=True)
            lifecycle.no_dotenv(root)
            for cwd in (root,root/'apps/api',root/'runtime/apps/web'):
                for name in ('.env','.env.local','.env.production','.env.production.local'):
                    path=cwd/name;path.write_text('PORT=unexpected')
                    with self.subTest(path=str(path)),self.assertRaisesRegex(RuntimeError,'NO_DOTENV'):lifecycle.no_dotenv(root)
                    path.unlink()

    def test_scanner_rejects_unknown_mode_and_changed_signature_set(self):
        with self.assertRaises(RuntimeError):scanner.sig_projection([])
        with self.assertRaises(RuntimeError):scanner.compare({}, {}, {}, {}, {}, 'boot','other',b'',b'',0)


if __name__=='__main__':unittest.main()
