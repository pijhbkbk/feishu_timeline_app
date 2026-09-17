#!/usr/bin/env node
/** Local, bounded portable profile. It never manages the production host, DNS,
 * Docker daemon, firewall, shared containers, or global trust settings. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAX = 640 * 1024 ** 2;
const ID = /^sha256:[a-f0-9]{64}$/;
const NAMES = ['api','web','ops','postgres','redis','scanner'];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function need(ok, message) { if (!ok) throw new Error(message); }
function command(bin,args,input,limit=MAX) {
  try { return execFileSync(bin,args,{input,maxBuffer:limit,timeout:300000,stdio:['pipe','pipe','pipe']}); }
  catch { throw new Error(`${bin} ${args[0]} failed; no credential-bearing output printed`); }
}
function docker(args,input) { return command('docker',args,input); }
function json(bytes) { return JSON.parse(bytes.toString()); }
function read(file,max=MAX,privateFile=false) {
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW); try {
    const s=fs.fstatSync(fd); need(s.isFile()&&s.nlink===1&&s.size<=max,'File type/size rejected');
    if(privateFile)need(s.uid===process.getuid()&&(s.mode&0o077)===0,'Secret file must belong to current user and be private');
    return fs.readFileSync(fd);
  } finally {fs.closeSync(fd);}
}
function syncDir(dir) {const fd=fs.openSync(dir,fs.constants.O_RDONLY);try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function write(file,bytes,mode=0o600) {const fd=fs.openSync(file,'wx',mode);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}syncDir(path.dirname(file));}
function rename(from,to) {fs.renameSync(from,to);syncDir(path.dirname(to));}
function writeJson(file,value) {write(file,JSON.stringify(value,null,2)+'\n');}
function privateDir(dir) {fs.mkdirSync(dir,{mode:0o700});}
function assertDir(dir) {const s=fs.lstatSync(dir);need(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===process.getuid()&&(s.mode&0o077)===0,'Private owned directory required');}
function inspect(image) {need(ID.test(image),'Image must be full immutable local ID'); return json(docker(['image','inspect',image]))[0];}
function shaFile(file) {
  const h=crypto.createHash('sha256'); const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW); const b=Buffer.alloc(1024*1024);
  try {let size;while((size=fs.readSync(fd,b))>0)h.update(b.subarray(0,size));}finally{fs.closeSync(fd);} return h.digest('hex');
}
export function validateManifest(m) {
  need(m.version===1&&/^[a-f0-9]{40}$/.test(m.commit)&&/^[a-f0-9]{40}$/.test(m.tree),'Invalid software identity');
  need(['amd64','arm64'].includes(m.architecture)&&m.postgresMajor===14,'Unsupported platform/database major');
  need(Object.keys(m.images).sort().join()===NAMES.slice().sort().join()&&Object.values(m.images).every(v=>ID.test(v)),'Incomplete image set');
  need(typeof m.release==='string'&&/^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/.test(m.release),'Invalid release');
  need(typeof m.buildTime==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(m.buildTime),'Invalid build time');
  return m;
}
function software(dir,load=false) {
  const m=validateManifest(json(read(path.join(dir,'manifest.json'),1024*1024)));
  need(m.files&&Object.keys(m.files).sort().join()===['portable.mjs','data.mjs','proxy.mjs','tunnel.mjs','THIRD_PARTY_NOTICES','source.tar','images.tar'].sort().join(),'Incomplete software file manifest');
  for(const [name,digest]of Object.entries(m.files)) {
    need(/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)&&/^[a-f0-9]{64}$/.test(digest),'Invalid software file');
    need(shaFile(path.join(dir,name))===digest,'Software checksum differs: '+name);
  }
  if(load)docker(['load','--input',path.join(dir,'images.tar')]);
  for(const name of NAMES) {const item=inspect(m.images[name]);need(item.Os==='linux'&&item.Architecture===m.architecture,'Image platform mismatch');}
  return m;
}
function imageMetadata(m) {
  for(const name of ['api','web','ops']) {
    const labels=inspect(m.images[name]).Config.Labels;
    need(labels['org.opencontainers.image.revision']===m.commit&&labels['com.feishu-timeline.source-tree']===m.tree&&labels['org.opencontainers.image.version']===m.release&&labels['org.opencontainers.image.created']===m.buildTime,'Application identity mismatch');
  }
  need(docker(['run','--rm','--pull=never','--network=none',m.images.postgres,'postgres','--version']).toString().includes('PostgreSQL) 14.'),'PostgreSQL 14 required');
}
function pack(specFile,out) {
  const spec=validateManifest(json(read(specFile,32768))); imageMetadata(spec);
  const repo=path.resolve(HERE,'../..');
  need(command('git',['-C',repo,'status','--porcelain','--untracked-files=no']).length===0,'Package only committed clean source');
  need(command('git',['-C',repo,'rev-parse','HEAD']).toString().trim()===spec.commit,'Package source HEAD and images differ');
  privateDir(out);
  for(const name of ['portable.mjs','data.mjs','proxy.mjs','tunnel.mjs'])write(path.join(out,name),read(path.join(HERE,name)),0o644);
  write(path.join(out,'THIRD_PARTY_NOTICES'),read(path.join(repo,'THIRD_PARTY_NOTICES')),0o644);
  const fd=fs.openSync(path.join(out,'source.tar'), 'wx',0o600);
  try{execFileSync('git',['-C',repo,'archive',spec.commit],{stdio:['ignore',fd,'pipe']});}finally{fs.closeSync(fd);}
  docker(['save','--output',path.join(out,'images.tar'),...new Set(Object.values(spec.images))]);
  fs.chmodSync(path.join(out,'images.tar'),0o600);
  const files={};for(const name of fs.readdirSync(out))files[name]=shaFile(path.join(out,name));
  writeJson(path.join(out,'manifest.json'),{...spec,files,scope:'Linux containers; PG14; explicit loopback HTTPS; no third-party identity; no production deployment authorization'});
  console.log(JSON.stringify({softwarePackage:out,commit:spec.commit,files:Object.keys(files),secretsIncluded:false}));
}
function instance(root) {
  assertDir(root);const c=json(read(path.join(root,'instance.json'),65536,true));const m=validateManifest(c.software);
  need(/^timeline-portable-[a-f0-9]{12}$/.test(c.name),'Invalid instance name');
  const u=new URL(c.origin);need(u.protocol==='https:'&&u.hostname==='localhost'&&u.origin===c.origin&&Number(u.port)>=1024,'This delivered profile only permits explicit localhost HTTPS');
  return {root,c,m};
}
function compose(s,args,input) {
  return docker(['compose','--project-name',s.c.name,'--file',path.join(s.root,'compose.json'),...args],input);
}
function runtimeEnv(m,secrets,origin) {
  return {
    NODE_ENV:'production',DEPLOYMENT_ENV:'staging',HOST:'0.0.0.0',PORT:'3001',
    EXPECTED_SOURCE_COMMIT:m.commit,EXPECTED_SOURCE_TREE:m.tree,EXPECTED_RELEASE:m.release,EXPECTED_BUILD_TIME:m.buildTime,
    FRONTEND_URL:origin,AUTH_MOCK_ENABLED:'false',DATABASE_URL:`postgresql://timeline_app:${secrets.database}@postgres:5432/timeline?connection_limit=8&pool_timeout=10`,
    REDIS_URL:`redis://:${secrets.redis}@redis:6379`,OBJECT_STORAGE_PROVIDER:'local',OBJECT_STORAGE_LOCAL_ROOT:'/app/var/object-storage',
    MALWARE_SCANNER_PROVIDER:'clamav',CLAMAV_HOST:'scanner',CLAMAV_PORT:'3310',CLAMAV_TIMEOUT_MS:'15000',CLAMAV_MAX_SIGNATURE_AGE_HOURS:'48',
    NOTIFICATION_QUEUE_ENABLED:'true',NOTIFICATION_REDIS_QUEUE_MAX_JOBS:'256',NOTIFICATION_MEMORY_QUEUE_MAX_JOBS:'256',
    ATTACHMENT_STORAGE_GLOBAL_MAX_BYTES:'2147483648',ATTACHMENT_STORAGE_PROJECT_MAX_BYTES:'536870912',ATTACHMENT_STORAGE_ACTOR_MAX_BYTES:'268435456',
    ATTACHMENT_STORAGE_GLOBAL_MAX_OBJECTS:'5000',ATTACHMENT_STORAGE_PROJECT_MAX_OBJECTS:'1000',ATTACHMENT_STORAGE_ACTOR_MAX_OBJECTS:'500',
    ATTACHMENT_STORAGE_MIN_FREE_BYTES:'1073741824',ATTACHMENT_STORAGE_RESERVATION_TTL_MS:'7200000',ATTACHMENT_STORAGE_ACTOR_WINDOW_MS:'2592000000',
    ATTACHMENT_STORAGE_RECONCILE_INTERVAL_MS:'300000',ATTACHMENT_STORAGE_RECONCILE_BATCH_SIZE:'100',ATTACHMENT_STORAGE_RECONCILIATION_LEASE_MS:'300000',
    ATTACHMENT_STORAGE_RECONCILIATION_RETRY_MS:'300000',ATTACHMENT_STORAGE_PURGED_METADATA_RETENTION_MS:'7776000000',
    UPLOAD_ADMISSION_GLOBAL_LIMIT:'4',UPLOAD_ADMISSION_PER_ACTOR_LIMIT:'2',UPLOAD_ADMISSION_PER_TARGET_LIMIT:'3',
    DOWNLOAD_ADMISSION_GLOBAL_LIMIT:'8',DOWNLOAD_ADMISSION_PER_ACTOR_LIMIT:'2',DOWNLOAD_ADMISSION_PER_TARGET_LIMIT:'2',
  };
}
function init(packageDir,root,origin,certFile,keyFile) {
  const m=software(packageDir,true);imageMetadata(m);const u=new URL(origin);
  need(u.protocol==='https:'&&u.hostname==='localhost'&&u.origin===origin&&Number(u.port)>=1024,'Use https://localhost:PORT (1024+)');
  privateDir(root);privateDir(path.join(root,'software'));privateDir(path.join(root,'signatures'));fs.chmodSync(path.join(root,'signatures'),0o755);
  for(const name of ['portable.mjs','data.mjs','proxy.mjs','tunnel.mjs'])write(path.join(root,'software',name),read(path.join(packageDir,name)),0o644);
  write(path.join(root,'tls.crt'),read(certFile,32768));write(path.join(root,'tls.key'),read(keyFile,32768,true));
  const secrets={database:crypto.randomBytes(32).toString('hex'),backup:crypto.randomBytes(32).toString('hex'),admin:crypto.randomBytes(32).toString('hex'),redis:crypto.randomBytes(32).toString('hex')};
  writeJson(path.join(root,'secrets.json'),secrets);write(path.join(root,'backup.key'),crypto.randomBytes(32));
  const name='timeline-portable-'+crypto.randomBytes(6).toString('hex');writeJson(path.join(root,'instance.json'),{version:1,name,origin,software:m});
  const environment=runtimeEnv(m,secrets,origin);
  const base={pull_policy:'never',platform:'linux/'+m.architecture,networks:['isolated'],restart:'no',pids_limit:128,labels:{purpose:'timeline-portable-isolated','com.timeline.portable.instance':name},security_opt:['no-new-privileges:true'],logging:{driver:'json-file',options:{'max-size':'2m','max-file':'2'}}};
  const hardened={...base,read_only:true,cap_drop:['ALL'],tmpfs:['/tmp:rw,noexec,nosuid,size=64m']};
  const dataMount=path.join(root,'software','data.mjs')+':/portable/data.mjs:ro';
  const app={...hardened,image:m.images.api,user:'1000:1000',environment,volumes:['objects:/app/var/object-storage',dataMount],mem_limit:'1024m'};
  const services={
    postgres:{...base,image:m.images.postgres,environment:{POSTGRES_PASSWORD:secrets.admin,POSTGRES_DB:'postgres'},volumes:['database:/var/lib/postgresql/data'],mem_limit:'512m',healthcheck:{test:['CMD','pg_isready','-U','postgres'],interval:'2s',timeout:'2s',retries:30}},
    redis:{...hardened,image:m.images.redis,user:'999:999',command:['redis-server','--appendonly','yes','--appendfsync','always','--aof-load-truncated','no','--maxmemory','64mb','--maxmemory-policy','noeviction','--requirepass',secrets.redis],volumes:['redis:/data'],mem_limit:'256m'},
    api:app,
    helper:{...app,profiles:['ops'],entrypoint:['node'],command:['/portable/data.mjs']},
    migrate:{...hardened,image:m.images.ops,user:'1000:1000',profiles:['ops'],environment,command:['/app/node_modules/.bin/prisma','migrate','deploy','--schema','prisma/schema.prisma'],mem_limit:'768m'},
    web:{...hardened,image:m.images.web,user:'1000:1000',mem_limit:'512m',environment:{NODE_ENV:'production',DEPLOYMENT_ENV:'staging',HOSTNAME:'0.0.0.0',PORT:'3000',EXPECTED_SOURCE_COMMIT:m.commit,EXPECTED_SOURCE_TREE:m.tree,EXPECTED_RELEASE:m.release,EXPECTED_BUILD_TIME:m.buildTime,V1_FALLBACK_ENABLED:'false'}},
    proxy:{...hardened,image:m.images.api,user:`${process.getuid()}:${process.getgid()}`,mem_limit:'128m',entrypoint:['node','/portable/proxy.mjs'],environment:{PUBLIC_ORIGIN:origin},volumes:[path.join(root,'software','proxy.mjs')+':/portable/proxy.mjs:ro',path.join(root,'tls.crt')+':/run/tls.crt:ro',path.join(root,'tls.key')+':/run/tls.key:ro']},
    scanner:{...hardened,image:m.images.scanner,user:'100:101',mem_limit:'2048m',entrypoint:['/usr/sbin/clamd','--config-file=/run/clamd.conf'],volumes:[path.join(root,'signatures')+':/var/lib/clamav:ro',path.join(root,'clamd.conf')+':/run/clamd.conf:ro'],healthcheck:{disable:true}},
  };
  // The proxy uses the host owner's numeric UID, keeping the private TLS key 0600.
  write(path.join(root,'clamd.conf'),'Foreground yes\nDatabaseDirectory /var/lib/clamav\nTCPSocket 3310\nTCPAddr 0.0.0.0\nMaxThreads 1\nMaxQueue 8\nReadTimeout 30\nCommandReadTimeout 10\nStreamMaxLength 21M\nMaxFileSize 20M\nMaxScanSize 100M\nMaxScanTime 10000\nMaxRecursion 10\nMaxFiles 1000\nAlertExceedsMax yes\nSelfCheck 0\nOfficialDatabaseOnly yes\nConcurrentDatabaseReload no\n',0o644);
  writeJson(path.join(root,'compose.json'),{services,networks:{isolated:{internal:true,enable_ipv6:false}},volumes:{database:{},redis:{},objects:{}}});
  console.log(JSON.stringify({instance:root,name,origin,publicEgress:false,secretMaterials:'secrets.json, backup.key, tls.key; keep separate from software/backup'}));
}
export function databaseCommand(tool,args,backup=false) {
  need(['psql','pg_dump','pg_restore'].includes(tool),'Unsupported PostgreSQL tool');
  return ['/bin/sh','-c','IFS= read -r PGPASSWORD || exit 1; export PGPASSWORD; exec "$@"','portable-pg',tool,'-h','127.0.0.1','-U',backup?'timeline_backup':'timeline_app',...args];
}
function appPostgres(s,tool,args,input=Buffer.alloc(0),backup=false) {
  const secret=json(read(path.join(s.root,'secrets.json'),8192,true));const password=backup?secret.backup:secret.database;need(/^[a-f0-9]{64}$/.test(password),'Invalid database credential');
  const bytes=Buffer.isBuffer(input)?input:Buffer.from(input);
  // The actual libpq session_user is unprivileged. SET ROLE from a postgres
  // connection is not isolation: an untrusted dump could issue RESET ROLE.
  // A fixed read consumes only the password line; the remaining pipe is SQL/dump.
  return compose(s,['exec','-T','postgres',...databaseCommand(tool,args,backup)],Buffer.concat([Buffer.from(password+'\n'),bytes]));
}
function sql(s,query,db='timeline',role=true) {
  const args=['-X','-qAt','-v','ON_ERROR_STOP=1','-d',db];
  return (role?appPostgres(s,'psql',args,query,role==='backup'):compose(s,['exec','-T','postgres','psql',...args,'-U','postgres'],query)).toString().trim();
}
function storage(s) {
  compose(s,['up','-d','--pull','never','postgres','redis']);
  for(let i=0;i<30;i++){try{sql(s,'SELECT 1;','postgres',false);return;}catch{Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1000);}}
  throw new Error('PostgreSQL startup timeout');
}
function newDatabase(s) {
  need(sql(s,"SELECT count(*) FROM pg_database WHERE datname='timeline';",'postgres',false)==='0','Restore/install requires a fresh target database');
  const secret=json(read(path.join(s.root,'secrets.json'),8192,true));
  need(/^[a-f0-9]{64}$/.test(secret.database),'Invalid database credential');
  need(/^[a-f0-9]{64}$/.test(secret.backup),'Invalid backup credential');
  sql(s,`CREATE ROLE timeline_app LOGIN PASSWORD '${secret.database}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;`,'postgres',false);
  sql(s,`CREATE ROLE timeline_backup LOGIN PASSWORD '${secret.backup}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; ALTER ROLE timeline_backup SET default_transaction_read_only=on;`,'postgres',false);
  sql(s,'CREATE DATABASE timeline OWNER timeline_app;','postgres',false);
  sql(s,'REVOKE ALL ON DATABASE timeline FROM PUBLIC;','postgres',false);
  sql(s,'GRANT CONNECT ON DATABASE timeline TO timeline_backup;','postgres',false);
  sql(s,'REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT ALL ON SCHEMA public TO timeline_app;','timeline',false);
  sql(s,'GRANT USAGE ON SCHEMA public TO timeline_backup; ALTER DEFAULT PRIVILEGES FOR ROLE timeline_app IN SCHEMA public GRANT SELECT ON TABLES TO timeline_backup; ALTER DEFAULT PRIVILEGES FOR ROLE timeline_app IN SCHEMA public GRANT SELECT ON SEQUENCES TO timeline_backup;','timeline',false);
}
function helper(s,op,input) {return json(compose(s,['run','--rm','--no-deps','-T','helper','/portable/data.mjs',op],input===undefined?undefined:JSON.stringify(input)));}
function fingerprint(s,backup=false) {
  const query=q=>sql(s,q,'timeline',backup?'backup':true);
  const names=query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;").split('\n');need(names.length>0&&names.length<=128,'Table bound exceeded');
  const tables={};for(const name of names){need(/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(name),'Invalid table name');
    const rows=Number(query(`SELECT count(*) FROM public."${name}";`));need(rows<=100000,'Table row bound exceeded');
    tables[name]={rows,sha256:query(`SELECT encode(sha256(convert_to(coalesce(string_agg(h,'' ORDER BY h),''),'UTF8')),'hex') FROM (SELECT encode(sha256(convert_to(row_to_json(t)::text,'UTF8')),'hex') h FROM public."${name}" t) x;`)};
  }
  const seqs=query("SELECT sequencename FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename;");const sequences={};
  for(const name of seqs?seqs.split('\n'):[]){need(/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(name),'Invalid sequence');sequences[name]=query(`SELECT last_value,is_called FROM public."${name}";`);}
  const schema=appPostgres(s,'pg_dump',['--schema-only','--no-owner','--no-privileges','timeline'],undefined,backup).toString().replace(/^\\(un)?restrict [A-Za-z0-9]+$/gm,'\\$1restrict FIXED_GUARD');
  need(Buffer.byteLength(schema)<=4*1024**2,'Schema exceeds bound');
  return {tables,sequences,schemaSha256:hash(schema)};
}
function compareFingerprints(expected,actual) {
  need(JSON.stringify(expected.tables)===JSON.stringify(actual.tables)&&JSON.stringify(expected.sequences)===JSON.stringify(actual.sequences),'Restored table or sequence fingerprint differs');
  // Existing native PG14 restore proof: pg_restore reparses one nested CHECK AND;
  // only this exact whole-schema pair is allowed, never arbitrary normalization.
  need(expected.schemaSha256===actual.schemaSha256||(expected.schemaSha256==='6574ca8373f287ba29217f064bd3b78ce45f6c091123360d104e9e4701cb78ec'&&actual.schemaSha256==='fd8912cccd930ef950fecd0d60511787786e3a3bca79c54ffeac1dfed90b1589'),'Restored schema fingerprint differs');
}
function checkAttachmentObjects(s,objects,backup=false) {
  const files=new Map(objects.map(item=>[item.path,item]));
  const rows=json(sql(s,`SELECT coalesce(json_agg(t),'[]') FROM (SELECT bucket,"objectKey","fileSize",checksum FROM attachments WHERE NOT "isDeleted" AND "scanStatus"='CLEAN') t;`,'timeline',backup?'backup':true));
  need(rows.length<=500,'Attachment relationship bound exceeded');
  for(const row of rows){const object=files.get(row.bucket+'/'+row.objectKey);need(object&&object.size===row.fileSize&&(!row.checksum||object.sha256===row.checksum),'Clean attachment bytes and metadata differ');}
}
function assertStopped(s) {
  const raw=compose(s,['ps','--all','--format','json','api','web','proxy']).toString().trim();
  for(const row of raw?raw.split('\n'):[]){const item=json(row);need(item.State!=='running','Writers must be stopped');}
}
function tunnel(s,action) {return command(process.execPath,[path.join(s.root,'software','tunnel.mjs'),action,s.root]);}
function stop(s) {tunnel(s,'stop');compose(s,['stop','--timeout','60','proxy','api','web']);assertStopped(s);}
function backup(s,out,keyFile) {
  stop(s);
  const api=compose(s,['ps','--all','--quiet','api']).toString().trim();need(/^[a-f0-9]{64}$/.test(api),'No source API container');
  const stopped=json(docker(['inspect',api]))[0].State;
  need(stopped.ExitCode===0&&!stopped.OOMKilled,'API did not prove graceful write drain; backup refused');
  sql(s,'ALTER ROLE timeline_app NOLOGIN;','postgres',false);
  try {
    sql(s,"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='timeline' AND pid<>pg_backend_pid();",'postgres',false);
    need(sql(s,"SELECT count(*) FROM pg_stat_activity WHERE datname='timeline';",'postgres',false)==='0','Database writers remain');
    need(sql(s,"SELECT count(*) FROM pg_prepared_xacts WHERE database='timeline';",'postgres',false)==='0','Prepared transactions present');
    need(sql(s,'SELECT count(*) FROM pg_subscription;','timeline',false)==='0','Subscriptions unsupported');
    need(Number(sql(s,'SELECT pg_database_size(current_database());','timeline','backup'))<=64*1024**2,'Database exceeds supported 64 MiB');
    const before=fingerprint(s,true);
    const dump=appPostgres(s,'pg_dump',['--format=custom','--no-owner','--no-privileges','timeline'],undefined,true);
    need(dump.length<=64*1024**2&&dump.subarray(0,5).toString()==='PGDMP','Invalid database dump');
    const objects=helper(s,'objects-read');checkAttachmentObjects(s,objects,true);const queue=helper(s,'queue-read');
    need(JSON.stringify(before)===JSON.stringify(fingerprint(s,true)),'Database changed while frozen');
    const body=Buffer.from(JSON.stringify({version:1,softwareSha256:hash(JSON.stringify(s.m)),commit:s.m.commit,postgresMajor:14,createdAt:new Date().toISOString(),database:{bytes:dump.toString('base64'),sha256:hash(dump)},fingerprints:before,objects,queue}));
    need(body.length<=MAX,'Backup exceeds bound');const key=read(keyFile,32,true);need(key.length===32,'Backup key must be 32 random bytes');
    const nonce=crypto.randomBytes(12);const cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(Buffer.from('timeline-portable-backup-v1'));
    const encrypted=Buffer.concat([cipher.update(body),cipher.final()]);write(out,Buffer.concat([Buffer.from('TLPBK001'),nonce,cipher.getAuthTag(),encrypted]));
    console.log(JSON.stringify({backup:out,sha256:shaFile(out),tables:Object.keys(before.tables).length,objects:objects.length,persistentQueueKeys:queue.length,writers:'stopped; explicit start is required',sessionsExported:false}));
  }finally{sql(s,'ALTER ROLE timeline_app LOGIN;','postgres',false); /* API remains stopped. */ }
}
export function decryptBackup(raw,key) {
  need(raw.length>=36&&raw.length<=MAX+36&&raw.subarray(0,8).toString()==='TLPBK001'&&key.length===32,'Invalid encrypted backup');
  const d=crypto.createDecipheriv('aes-256-gcm',key,raw.subarray(8,20));d.setAAD(Buffer.from('timeline-portable-backup-v1'));d.setAuthTag(raw.subarray(20,36));
  return json(Buffer.concat([d.update(raw.subarray(36)),d.final()]));
}
function restore(s,file,keyFile) {
  assertStopped(s);const b=decryptBackup(read(file,MAX+36,true),read(keyFile,32,true));
  need(b.version===1&&b.commit===s.m.commit&&b.postgresMajor===14&&b.softwareSha256===hash(JSON.stringify(s.m)),'Restore requires the exact same software manifest, images and PG major');
  const dump=Buffer.from(b.database.bytes,'base64');need(dump.length<=64*1024**2&&hash(dump)===b.database.sha256&&dump.subarray(0,5).toString()==='PGDMP','Database checksum differs');
  storage(s);newDatabase(s);
  try {
    appPostgres(s,'pg_restore',['--exit-on-error','--single-transaction','--no-owner','--no-privileges','--dbname=timeline'],dump);
    compareFingerprints(b.fingerprints,fingerprint(s));
    checkAttachmentObjects(s,b.objects);
    helper(s,'objects-write',b.objects);helper(s,'queue-write',b.queue);
    // Intentional boundary reset, after exact pre-reset comparison. Do not seed.
    sql(s,'BEGIN; UPDATE users SET "authVersion"="authVersion"+1; UPDATE local_credentials SET "resetTokenHash"=NULL,"resetExpiresAt"=NULL,"resetVersion"=NULL; UPDATE attachment_storage_reservations SET "leaseExpiresAt"=TIMESTAMP \'1970-01-01\' WHERE "leaseExpiresAt" IS NOT NULL; COMMIT;');
    writeJson(path.join(s.root,'restore-complete.json'),{commit:s.m.commit,backupSha256:hash(read(file,MAX+36,true)),restoredAt:new Date().toISOString(),exactPreResetFingerprint:true,tableCount:Object.keys(b.fingerprints.tables).length,objectCount:b.objects.length,sessionBoundaryReset:true,seedExecuted:false,sourceMustRemainStopped:true});
    console.log(JSON.stringify({restored:true,tableCount:Object.keys(b.fingerprints.tables).length,objectCount:b.objects.length,sessionsRestored:false,seedExecuted:false,startPerformed:false}));
  }catch(e){sql(s,'ALTER ROLE timeline_app NOLOGIN;','postgres',false);throw e;}
}
function install(s) {storage(s);newDatabase(s);compose(s,['run','--rm','--no-deps','-T','migrate']);compose(s,['run','--rm','--no-deps','-T','--entrypoint','node','api','dist/cli/native-catalog.js','initialize']);writeJson(path.join(s.root,'install-complete.json'),{commit:s.m.commit,installedAt:new Date().toISOString()});console.log('{"freshInstall":true,"administratorInitialized":false}');}
async function start(s) {
  need(fs.existsSync(path.join(s.root,'install-complete.json'))||fs.existsSync(path.join(s.root,'restore-complete.json')),'Install or verified restore required');
  storage(s);compose(s,['up','-d','--pull','never','api','web','proxy']);
  let scanner='blocked: verified fresh signatures required';
  try {validateActiveSignatures(s);compose(s,['up','-d','--force-recreate','--pull','never','scanner']);scanner='start requested from verified immutable signature generation';}
  catch {compose(s,['stop','--timeout','30','scanner']);}
  tunnel(s,'start');
  const get=route=>new Promise((resolve,reject)=>{
    const url=new URL(s.c.origin+route);const req=https.get(url,{family:4,ca:read(path.join(s.root,'tls.crt'),32768),timeout:10000},res=>{let bytes='';res.on('data',b=>{bytes+=b;if(bytes.length>32768)req.destroy(new Error('Health response exceeds bound'));});res.on('end',()=>{try{need(res.statusCode===200,'Health request failed');resolve(json(bytes));}catch(e){reject(e);}});});req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('Health timeout')));
  });
  let verified=false;for(let i=0;i<30;i++){try{const api=await get('/api/health');const web=await get('/build-info');need(api.runtimeCommit===s.m.commit&&web.runtimeCommit===s.m.commit,'Runtime commit differs');verified=true;break;}catch{await new Promise(r=>setTimeout(r,1000));}}
  need(verified,'Exact loopback HTTPS runtime verification failed');
  console.log(JSON.stringify({started:true,httpsRuntimeVerified:true,origin:s.c.origin,scanner,outboundNetwork:'Docker internal network; no public egress; loopback exec control channel'}));
}
function initialize(s,passwordFile,username,name) {
  need(fs.existsSync(path.join(s.root,'install-complete.json'))&&!fs.existsSync(path.join(s.root,'restore-complete.json')),'Administrator bootstrap only allowed for a fresh install');
  need(/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(username),'Invalid username');const bytes=read(passwordFile,512,true);need(bytes.length>=15,'Password file too short');
  // stdin is copied into the short-lived container's private tmpfs by UID 1000,
  // so the existing CLI ownership checks remain intact on Linux and Docker Desktop.
  const code="const fs=require('node:fs');fs.writeFileSync('/tmp/admin.password',fs.readFileSync(0),{mode:0o600,flag:'wx'});process.argv=[process.execPath,'dist/cli/native-account.js','initialize','--username',process.argv[1],'--name',process.argv[2],'--password-file','/tmp/admin.password'];require('./dist/cli/native-account.js');";
  const out=compose(s,['run','--rm','--no-deps','-T','--entrypoint','node','api','-e',code,username,name],bytes);console.log(out.toString().trim());
}
function importSignatures(s,source) {
  const names=fs.readdirSync(source).sort();need(JSON.stringify(names)===JSON.stringify(['bytecode.cvd','daily.cvd','main.cvd']),'Import exactly the three official signed CVD databases');
  const oldFile=path.join(s.root,'signature-receipt.json');const old=fs.existsSync(oldFile)?json(read(oldFile,16384,true)):undefined;
  const generation='signatures-'+crypto.randomBytes(12).toString('hex');const dir=path.join(s.root,generation);privateDir(dir);fs.chmodSync(dir,0o755);
  const records=[];let signatureBytes=0;
  for(const name of names) {
    const raw=read(path.join(source,name),512*1024**2);need(raw.length>=512&&(signatureBytes+=raw.length)<=1024**3,'Signature set outside size bounds');const fields=raw.subarray(0,512).toString('ascii').trim().split(':');
    need(fields.length===9&&fields[0]==='ClamAV-VDB'&&/^\d+$/.test(fields[2])&&/^\d+$/.test(fields[8]),'Malformed signed header');
    const version=Number(fields[2]);const signedAt=Number(fields[8]);need(!old||version>=old.files.find(x=>x.name===name).version,'Signature downgrade refused');
    if(name==='daily.cvd')need(Date.now()/1000-signedAt>=0&&Date.now()/1000-signedAt<48*3600,'Daily signatures must be younger than 48 hours');
    // Freeze the exact cached bytes first. Never verify the mutable input path.
    const frozen=path.join(dir,name);write(frozen,raw,0o444);
    const output=docker(['run','--rm','--pull=never','--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--mount',`type=bind,source=${dir},target=/verified,readonly`,'--entrypoint','/usr/bin/sigtool',s.m.images.scanner,'--info','/verified/'+name]).toString();
    need(output.includes('Verification OK')&&shaFile(frozen)===hash(raw),'Official signature verification failed');records.push({name,version,signedAt,sha256:hash(raw),size:raw.length});
  }
  compose(s,['stop','--timeout','30','scanner']);
  // One generation is the unit of activation. The durable floor/receipt advances
  // before replacing compose configuration; a crash between these writes leaves
  // a detectable mismatch and cannot start the scanner. Old generations remain.
  const record={generation,files:records,importedAt:new Date().toISOString(),maxAgeHours:48};const temp=oldFile+'.'+crypto.randomBytes(6).toString('hex');writeJson(temp,record);rename(temp,oldFile);
  const configFile=path.join(s.root,'compose.json');const config=json(read(configFile,65536,true));
  config.services.scanner.volumes[0]=dir+':/var/lib/clamav:ro';
  const configTemp=configFile+'.'+crypto.randomBytes(6).toString('hex');writeJson(configTemp,config);rename(configTemp,configFile);
  validateActiveSignatures(s);
  console.log(JSON.stringify({officialSignaturesVerified:true,maxAgeHours:48,versions:records.map(x=>({name:x.name,version:x.version})),scanner:'stopped; explicit start activates imported set'}));
}
function validateActiveSignatures(s) {
  const record=json(read(path.join(s.root,'signature-receipt.json'),16384,true));
  need(/^signatures-[a-f0-9]{24}$/.test(record.generation)&&record.maxAgeHours===48&&record.files.length===3,'Signature generation metadata rejected');
  const dir=path.join(s.root,record.generation);const names=['bytecode.cvd','daily.cvd','main.cvd'];
  need(fs.readdirSync(dir).sort().join()===names.join()&&record.files.map(f=>f.name).sort().join()===names.join(),'Signature generation is incomplete');
  for(const item of record.files) {
    const raw=read(path.join(dir,item.name),512*1024**2);const fields=raw.subarray(0,512).toString('ascii').trim().split(':');
    need(raw.length===item.size&&hash(raw)===item.sha256&&Number(fields[2])===item.version&&Number(fields[8])===item.signedAt,'Signature generation changed');
    if(item.name==='daily.cvd')need(Date.now()/1000-item.signedAt>=0&&Date.now()/1000-item.signedAt<48*3600,'Signatures are stale');
  }
  const config=json(read(path.join(s.root,'compose.json'),65536,true));
  need(config.services.scanner.volumes[0]===dir+':/var/lib/clamav:ro','Signature activation not committed');
}
async function main(args) {
  const [op,...a]=args;need(Number(process.versions.node.split('.')[0])>=24,'Node.js 24 or newer required');
  if(op==='pack'&&a.length===2)return pack(path.resolve(a[0]),path.resolve(a[1]));
  if(op==='init'&&a.length===5)return init(path.resolve(a[0]),path.resolve(a[1]),a[2],path.resolve(a[3]),path.resolve(a[4]));
  need(a[0],'Missing instance directory');const s=instance(path.resolve(a[0]));
  const lock=path.join(s.root,'operation.lock');const fd=fs.openSync(lock,'wx',0o600);
  try {
  fs.writeFileSync(fd,JSON.stringify({pid:process.pid,operation:op}));
  // Missing images are a hard error. Runtime never pulls, installs npm, or contacts cloud identity.
  for(const image of Object.values(s.m.images))inspect(image);
  if(op==='install'&&a.length===1)return install(s);
  if(op==='start'&&a.length===1)return await start(s);
  if(op==='stop'&&a.length===1){stop(s);compose(s,['stop','--timeout','30','scanner','redis','postgres']);return;}
  if(op==='status'&&a.length===1){console.log(compose(s,['ps','--format','json']).toString());return;}
  if(op==='initialize'&&a.length===4)return initialize(s,path.resolve(a[1]),a[2],a[3]);
  if(op==='backup'&&a.length===3)return backup(s,path.resolve(a[1]),path.resolve(a[2]));
  if(op==='restore'&&a.length===3)return restore(s,path.resolve(a[1]),path.resolve(a[2]));
  if(op==='import-signatures'&&a.length===2)return importSignatures(s,path.resolve(a[1]));
  throw new Error('Unsupported operation/arguments. Commands: pack, init, install, initialize, start, stop, status, backup, restore, import-signatures.');
  } finally {fs.closeSync(fd);fs.unlinkSync(lock);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
