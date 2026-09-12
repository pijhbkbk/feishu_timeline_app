import copy
import json
import unittest
from unittest.mock import patch
import native_runtime_app as app
import native_backup_controller as backup


def fixture(component):
    image = {'Id':'sha256:fixed','Config':{'Entrypoint':['docker-entrypoint.sh'],'Env':['PATH=/usr/bin','NODE_ENV=production']}}
    env = list(image['Config']['Env']) + (['APP_TEST=bounded'] if component == 'api' else [])
    return image, {
        'Id':'a'*64,'Name':'/timeline-native-'+component,'Image':image['Id'],
        'Config':{'Image':app.IMAGES[component],'Labels':{'com.timeline.native.service':component+'-v1'},
                  'User':'1000:1000','Entrypoint':image['Config']['Entrypoint'],'Cmd':['node','dist/main.js' if component=='api' else 'server.js'],'Env':env},
        'State':{'Running':False,'Pid':0},
        'HostConfig':{'NetworkMode':'timeline-native-'+component,'ReadonlyRootfs':True,'Privileged':False,
                      'Memory':1073741824 if component=='api' else 536870912,'MemorySwap':1073741824 if component=='api' else 536870912,
                      'NanoCpus':1000000000 if component=='api' else 750000000,'PidsLimit':128,'RestartPolicy':{'Name':'no'},
                      'CapDrop':['ALL'],'CapAdd':None,'PortBindings':{},'PublishAllPorts':False,'SecurityOpt':['no-new-privileges'],
                      'Devices':[],'DeviceRequests':None,'PidMode':'','Tmpfs':{'/tmp':'rw,noexec,nosuid,size=64m'}},
        'Mounts':[{'Source':str(app.ROOT/'objects'),'Destination':'/app/var/object-storage','RW':True,'Type':'bind'}] if component=='api' else [],
        'NetworkSettings':{'Networks':{'timeline-native-'+component:{'IPAMConfig':{'IPv4Address':'172.30.44.2' if component=='api' else '172.30.45.2'}}}},
    }


class RuntimeBoundaryTests(unittest.TestCase):
    def test_host_access_or_credential_and_mount_injection_rejected(self):
        with patch.object(app,'environment_bytes',return_value=b'APP_TEST=bounded\n'),patch.object(app,'web_environment_bytes',return_value=b''):
            for component in ('api','web'):
                image,item=fixture(component);app.validate_container(component,item,image)
                for section,key,bad in [('HostConfig','NetworkMode','host'),('HostConfig','Privileged',True),
                                        ('HostConfig','PublishAllPorts',True),('HostConfig','SecurityOpt',['seccomp=unconfined']),
                                        ('Config','User','0'),('Config','Cmd',['sh','-c','echo altered']),
                                        ('Config','Env',item['Config']['Env']+['AUTH_MOCK_ENABLED=true']),
                                        ('HostConfig','Tmpfs',{'/etc':'rw'})]:
                    with self.subTest(component=component,field=key):
                        changed=copy.deepcopy(item);changed[section][key]=bad
                        with self.assertRaises(backup.Failure):app.validate_container(component,changed,image)
                changed=copy.deepcopy(item);changed['Mounts'].append({'Source':'/var/run/docker.sock','Destination':'/socket','RW':True,'Type':'bind'})
                with self.assertRaises(backup.Failure):app.validate_container(component,changed,image)
                changed=copy.deepcopy(item);changed['NetworkSettings']['Networks']['bridge']={}
                with self.assertRaises(backup.Failure):app.validate_container(component,changed,image)

    def test_runtime_does_not_get_old_database_or_third_party_credentials(self):
        value=app.fixed_environment({'password':'new-copy-password'},'new-redis-password')
        self.assertIn('/feishu_timeline_restore_c38c57da?',value['DATABASE_URL'])
        self.assertNotIn('feishu_timeline_app:',value['DATABASE_URL'])
        self.assertEqual(value['AUTH_MOCK_ENABLED'],'false')
        self.assertFalse(any(key.startswith(('FEISHU_','GOOGLE_')) for key in value))
        self.assertEqual(value['NOTIFICATION_REDIS_QUEUE_MAX_JOBS'],'256')
        self.assertEqual(value['EXPECTED_SOURCE_COMMIT'],app.COMMIT)
        self.assertEqual(value['EXPECTED_SOURCE_TREE'],app.TREE)
        web=dict(line.split('=',1) for line in app.web_environment_bytes().decode().splitlines())
        for key,expected in [('EXPECTED_SOURCE_COMMIT',app.COMMIT),('EXPECTED_SOURCE_TREE',app.TREE),('EXPECTED_RELEASE',app.RELEASE),('EXPECTED_BUILD_TIME',app.BUILD_TIME)]:
            self.assertEqual(value[key],expected);self.assertEqual(web[key],expected)

    def test_unprepared_or_damaged_configuration_cannot_create_container(self):
        with patch.object(app,'validate_files',side_effect=backup.Failure('bad env')),patch.object(app,'docker') as docker:
            with self.assertRaises(backup.Failure):app.prepare_start('api')
            docker.assert_not_called()
        with patch.object(app,'validate_files'),patch.object(backup,'read_json',return_value={}),patch.object(app,'docker') as docker:
            with self.assertRaises(backup.Failure):app.prepare_start('api')
            docker.assert_not_called()

    def test_unowned_container_never_stopped(self):
        _,item=fixture('api');item['Config']['Labels']={}
        with patch.object(app,'docker',side_effect=[b'abc\n',json.dumps(item and [item]).encode()]) as docker:
            with self.assertRaises(backup.Failure):app.stop('api')
            self.assertEqual(docker.call_count,2)

    def test_cleanup_uses_exact_id_and_proves_pid_exit(self):
        _,stopped=fixture('api');running=copy.deepcopy(stopped);running['State']={'Running':True,'Pid':12}
        with patch.object(app,'inspect',side_effect=[running,stopped,None]),patch.object(app,'docker') as docker:
            app.stop('api',remove=True)
            self.assertEqual(docker.call_args_list[0].args,('stop','--time=20','a'*64))
            self.assertEqual(docker.call_args_list[1].args,('rm','a'*64))
        with patch.object(app,'inspect',return_value=running),patch.object(app,'docker') as docker:
            with self.assertRaises(backup.Failure):app.stop('api',remove=True)
            self.assertEqual(docker.call_count,1)

    def test_dirty_migrated_copy_stops_before_any_role_or_bootstrap_mutation(self):
        with patch.object(app,'state_directory'),patch.object(app.database_scope,'verify'),patch.object(app,'inspect',return_value=None),patch.object(app,'image_identity'),\
             patch.object(app,'verify_migrated_copy',side_effect=backup.Failure('old rows changed')),patch.object(backup,'role_change') as role,\
             patch.object(backup,'write_private') as write:
            with self.assertRaises(backup.Failure):app.prepare()
            role.assert_not_called();write.assert_not_called()

    def test_resume_rejects_another_administrator_before_reading_password(self):
        wrong={'runtimeCommit':app.COMMIT,'database':app.migration.DATABASE,'administratorId':'different-user-id'}
        with patch.object(backup,'read_json',return_value=wrong),patch.object(backup,'read_file') as read:
            with self.assertRaises(backup.Failure):app.validate_resume('existing-admin-id')
            read.assert_not_called()

    def test_resume_preserves_existing_private_material(self):
        pending={'runtimeCommit':app.COMMIT,'database':app.migration.DATABASE,'administratorId':'existing-admin-id'}
        with patch.object(backup,'read_json',return_value=pending),patch.object(backup,'read_file',return_value=b'x'*32+b'\n') as read,\
             patch.object(app.Path,'iterdir',return_value=iter([])),patch.object(backup,'write_private') as write:
            app.validate_resume('existing-admin-id')
            read.assert_called_once_with(app.ROOT/'admin.password',512,owner=1000);write.assert_not_called()

    def test_existing_native_credential_prevents_reinitialization(self):
        previous={'migrations':[],'candidate':[],'tables':{'users':{'columns':['id'],'projection':{'count':12}}}}
        complete={'runtimeCommit':app.COMMIT,'oldColumnsUnchanged':True,'nativeCredentials':0}
        with patch.object(backup,'read_json',side_effect=[complete,previous]),patch.object(app.migration,'projection',return_value={'count':12}),\
             patch.object(app.migration,'tables',return_value={'users'}|app.migration.NEW_TABLES),patch.object(app.migration,'migration_rows',return_value=[]),\
             patch.object(app.migration,'query',side_effect=lambda q:'1' if 'local_credentials' in q else '0'):
            with self.assertRaisesRegex(backup.Failure,'already used'):app.verify_migrated_copy()

    def test_resume_does_not_recreate_password_environment_or_objects(self):
        previous={'tables':{'users':{'columns':['id','username','updatedAt']}}}
        with patch.object(app,'state_directory'),patch.object(app.database_scope,'verify'),\
             patch.object(app.Path,'exists',side_effect=[True,False]),patch.object(app,'inspect',return_value=None),patch.object(app,'image_identity'),\
             patch.object(app,'verify_migrated_copy',return_value=previous),patch.object(backup,'sql',side_effect=['t','0','0']),\
             patch.object(backup,'read_json',return_value={'objectCount':0,'databaseAndObjectsVerified':True}),\
             patch.object(app.Path,'iterdir',side_effect=lambda:iter([])),patch.object(app.migration,'query',side_effect=['existing-admin-id','0','1','0']),\
             patch.object(app.migration,'projection'),patch.object(app,'scoped_projection'),patch.object(app,'validate_resume') as resume,\
             patch.object(app,'validate_files'),patch.object(backup,'write_private') as write,patch.object(app.Path,'mkdir') as mkdir,\
             patch.object(backup,'role_change',side_effect=backup.Failure('stop before opening role')),patch.object(app,'recover_preparation'):
            with self.assertRaisesRegex(backup.Failure,'before opening role'):app.prepare(resume=True)
            resume.assert_called_once_with('existing-admin-id');write.assert_not_called();mkdir.assert_not_called()

    def test_database_recovery_targets_only_verified_copy_and_keeps_journal(self):
        # A journal with any other database is rejected before ALTER ROLE or Docker.
        with patch.object(app.database_scope,'recover'),patch.object(app.Path,'exists',return_value=True),patch.object(backup,'read_json',return_value={'runtimeCommit':app.COMMIT,'database':'feishu_timeline'}),\
             patch.object(backup,'role_change') as role,patch.object(app,'docker') as docker:
            with self.assertRaises(backup.Failure):app.recover_preparation()
            role.assert_not_called();docker.assert_not_called()


if __name__ == '__main__':unittest.main()
