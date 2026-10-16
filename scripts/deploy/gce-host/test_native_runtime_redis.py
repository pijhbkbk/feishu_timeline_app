import copy
import json
import unittest
from unittest.mock import patch
import native_runtime_redis as redis
import native_backup_controller as backup


def container():
    return {'Name':'/'+redis.NAME, 'Image':'sha256:fixed',
            'Config':{'Image':redis.IMAGE,'Labels':{'com.timeline.native.service':'redis-v1'}, 'User':'1000:1000',
                      'Entrypoint':['redis-server'],'Cmd':['/run/native-redis.conf']},
            'State':{'Running':False,'Pid':0},
            'HostConfig':{'NetworkMode':'timeline-native-api','ReadonlyRootfs':True,'Privileged':False,
                          'Memory':268435456,'MemorySwap':268435456,'NanoCpus':500000000,'PidsLimit':64,
                          'RestartPolicy':{'Name':'no'},'CapDrop':['ALL'],'CapAdd':None,'PortBindings':{},'PublishAllPorts':False,
                          'SecurityOpt':['no-new-privileges'],'Devices':[],'DeviceRequests':None,'PidMode':''},
            'Mounts':[{'Source':str(source),'Destination':dest,'RW':rw,'Type':'bind'} for source,dest,rw in
                      [(redis.ROOT/'redis-data','/data',True),(redis.ROOT/'redis.acl','/run/native-redis.acl',False),
                       (redis.CONFIG,'/run/native-redis.conf',False)]],
            'NetworkSettings':{'Networks':{'timeline-native-api':{'IPAMConfig':{'IPv4Address':'172.30.44.3'}}}}}


class RedisBoundaryTests(unittest.TestCase):
    def test_acl_never_contains_plaintext_and_keeps_notification_transport(self):
        text=redis.acl('A-private-random-password-should-not-be-emitted').decode()
        self.assertNotIn('A-private-random-password',text)
        self.assertIn('user default off',text)
        self.assertIn('~notifications:queued:*',text)
        self.assertNotIn('+@all',text)
        self.assertNotIn('+config',text)

    def test_container_with_wrong_privileges_mounts_or_network_is_rejected(self):
        valid=container();redis.validate_container(valid,'sha256:fixed')
        for section,key,bad in [('HostConfig','Privileged',True),('HostConfig','ReadonlyRootfs',False),
                                ('HostConfig','PortBindings',{'6379/tcp':[{'HostPort':'6379'}]}),
                                ('HostConfig','SecurityOpt',['seccomp=unconfined']),('Config','User','0'),
                                ('HostConfig','NetworkMode','host'),('HostConfig','PublishAllPorts',True)]:
            with self.subTest(key=key):
                changed=copy.deepcopy(valid);changed[section][key]=bad
                with self.assertRaises(backup.Failure):redis.validate_container(changed,'sha256:fixed')
        changed=copy.deepcopy(valid);changed['Mounts'][0]['Source']='/etc'
        with self.assertRaises(backup.Failure):redis.validate_container(changed,'sha256:fixed')
        changed=copy.deepcopy(valid);changed['NetworkSettings']['Networks']['bridge']={}
        with self.assertRaises(backup.Failure):redis.validate_container(changed,'sha256:fixed')

    def test_unowned_named_container_is_not_stopped(self):
        item=container();item['Config']['Labels']={}
        with patch.object(redis,'run',side_effect=[b'abc\n',json.dumps([item]).encode()]) as run:
            with self.assertRaises(backup.Failure):redis.stop()
            self.assertEqual(run.call_count,2)

    def test_damaged_files_prevent_container_creation(self):
        with patch.object(redis,'validate_files',side_effect=backup.Failure('damaged ACL')),patch.object(redis,'run') as run:
            with self.assertRaises(backup.Failure):redis.prepare_start()
            run.assert_not_called()

    def test_recovery_does_not_depend_on_reading_a_damaged_acl(self):
        item=container();item['State']={'Running':True,'Pid':4321}
        with patch.object(redis,'inspect',side_effect=[item,container()]),patch.object(redis,'run') as run,patch.object(redis,'validate_files') as validate:
            redis.stop();validate.assert_not_called()
            run.assert_called_once_with(['/usr/bin/docker','stop','--time=15',redis.NAME])

    def test_recovery_refuses_to_claim_success_when_process_remains(self):
        item=container();item['State']={'Running':True,'Pid':4321}
        with patch.object(redis,'inspect',return_value=item),patch.object(redis,'run'):
            with self.assertRaisesRegex(backup.Failure,'stop not proved'):redis.stop()


if __name__=='__main__':unittest.main()
