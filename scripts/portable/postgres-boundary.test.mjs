import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {databaseCommand} from './portable.mjs';

test('a custom dump and its post-restore trigger cannot RESET ROLE to a superuser', {skip:!process.env.PORTABLE_PG_TEST_IMAGE,timeout:120000}, async()=>{
  const image=process.env.PORTABLE_PG_TEST_IMAGE;assert.match(image,/^sha256:[a-f0-9]{64}$/);
  const name='timeline-portable-pg-boundary-'+randomBytes(6).toString('hex');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'timeline-portable-pg-boundary-'));fs.chmodSync(dir,0o700);
  const password=randomBytes(32).toString('hex');const envFile=path.join(dir,'database.env');fs.writeFileSync(envFile,'POSTGRES_PASSWORD='+password+'\nPOSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust\n',{mode:0o600});
  function run(args,input,ok=true){const r=spawnSync('docker',args,{input,maxBuffer:16*1024**2,timeout:60000});if(ok)assert.equal(r.status,0,'Docker/PostgreSQL test step failed (output withheld)');return r;}
  const admin=(query,db='postgres')=>run(['exec','-i',name,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',db],query).stdout.toString().trim();
  const app=(tool,args,input,ok=true)=>run(['exec','-i',name,...databaseCommand(tool,args)],Buffer.concat([Buffer.from(password+'\n'),Buffer.from(input)]),ok);
  try{
    run(['run','-d','--name',name,'--label','purpose=timeline-portable-boundary-test','--pull=never','--platform','linux/amd64','--network=none','--memory','512m','--pids-limit','128','--env-file',envFile,'--tmpfs','/var/lib/postgresql/data:rw,size=256m',image]);
    let ready=false;for(let i=0;i<40;i++){if(run(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres'],undefined,false).status===0){ready=true;break;}await new Promise(r=>setTimeout(r,250));}assert.equal(ready,true);
    admin(`CREATE ROLE timeline_app LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; CREATE DATABASE source; CREATE DATABASE timeline OWNER timeline_app;`);
    admin('REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT ALL ON SCHEMA public TO timeline_app;','timeline');
    const args=['-X','-qAt','-v','ON_ERROR_STOP=1','-d','timeline'];
    assert.notEqual(run(['exec','-i',name,...databaseCommand('psql',args)],'wrong-password\nSELECT 1;',false).status,0);
    assert.equal(app('psql',args,'RESET ROLE; SELECT session_user,current_user;').stdout.toString().trim(),'timeline_app|timeline_app');
    const functionSql=`CREATE FUNCTION public.attempt_escape(v int) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN IF current_database()='timeline' THEN EXECUTE 'RESET ROLE'; EXECUTE 'CREATE ROLE portable_test_escape SUPERUSER'; END IF; RETURN true; END $$; CREATE TABLE attack(value int CHECK(public.attempt_escape(value))); INSERT INTO attack VALUES(1);`;
    admin(functionSql,'source');
    const dump=run(['exec',name,'pg_dump','-U','postgres','--format=custom','--no-owner','--no-privileges','source']).stdout;
    const rejected=app('pg_restore',['--exit-on-error','--single-transaction','--no-owner','--no-privileges','--dbname=timeline'],dump,false);
    assert.equal(rejected.status,1);
    assert.match(rejected.stderr.toString(),/permission denied to create role|must be superuser|cannot set parameter "role"/);
    assert.equal(admin("SELECT count(*) FROM pg_roles WHERE rolname='portable_test_escape';"),'0');
    assert.equal(admin("SELECT count(*) FROM pg_tables WHERE schemaname='public';",'timeline'),'0');
    app('psql',args,`CREATE TABLE users(id int); CREATE FUNCTION public.trigger_escape() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN EXECUTE 'RESET ROLE'; EXECUTE 'ALTER ROLE timeline_app SUPERUSER'; RETURN NEW; END $$; CREATE TRIGGER attack BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION public.trigger_escape();`);
    assert.notEqual(app('psql',args,'INSERT INTO users VALUES(1);',false).status,0);
    assert.equal(admin("SELECT rolsuper FROM pg_roles WHERE rolname='timeline_app';"),'f');
    assert.notEqual(app('psql',args,"COPY (SELECT 1) TO PROGRAM 'true';",false).status,0);
  }finally{run(['rm','--force',name],undefined,false);fs.unlinkSync(envFile);fs.rmdirSync(dir);}
});
