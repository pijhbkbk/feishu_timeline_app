// A loopback-only control-channel forwarder for Docker internal networks. TLS
// terminates inside the pinned proxy container; no container receives public egress.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const [mode,rawRoot]=process.argv.slice(2);const root=path.resolve(rawRoot??'');
const state=fs.lstatSync(root);if(!state.isDirectory()||state.isSymbolicLink()||state.uid!==process.getuid()||(state.mode&0o077))throw new Error('Private instance directory required');
const conf=JSON.parse(fs.readFileSync(path.join(root,'instance.json')));const url=new URL(conf.origin);
if(!/^timeline-portable-[a-f0-9]{12}$/.test(conf.name)||url.protocol!=='https:'||url.hostname!=='localhost'||Number(url.port)<1024)throw new Error('Unapproved control tunnel target');
const container=conf.name+'-proxy-1';const control=path.join(root,'tunnel.sock');if(Buffer.byteLength(control)>95)throw new Error('Instance path too long for a private control socket');
async function controlCall(action){return new Promise((resolve,reject)=>{
  const socket=net.createConnection(control);let data='';socket.setTimeout(2000,()=>socket.destroy(new Error('Control timeout')));
  socket.on('connect',()=>socket.end(action+'\n'));socket.on('error',reject);socket.on('data',b=>{data+=b;if(data.length>1024)socket.destroy(new Error('Control response too large'));});socket.on('end',()=>{try{resolve(JSON.parse(data));}catch{reject(new Error('Invalid control response'));}});
});}
if(mode==='status')console.log(JSON.stringify(await controlCall('status')));
else if(mode==='stop'){try{console.log(JSON.stringify(await controlCall('stop')));}catch(error){if(!['ENOENT','ECONNREFUSED'].includes(error.code))throw error;console.log('{"stopped":true}');}}
else if(mode==='start'){
  try{console.log(JSON.stringify(await controlCall('status')));process.exit(0);}catch(error){if(!['ENOENT','ECONNREFUSED'].includes(error.code))throw error;}
  if(fs.existsSync(control)){const old=fs.lstatSync(control);if(!old.isSocket()||old.uid!==process.getuid())throw new Error('Unowned control socket');fs.unlinkSync(control);}
  const log=fs.openSync(path.join(root,'tunnel.log'),'a',0o600);
  const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'serve',root],{detached:true,stdio:['ignore',log,log]});child.unref();fs.closeSync(log);
  let ready=false;for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,100));try{const result=await controlCall('status');console.log(JSON.stringify(result));ready=true;break;}catch{}}
  if(!ready)throw new Error('Loopback control tunnel did not start');
}else if(mode==='serve'){
  const actual=JSON.parse(execFileSync('docker',['inspect',container]))[0];
  if(actual.Image!==conf.software.images.api||actual.Config.Labels['com.timeline.portable.instance']!==conf.name||!actual.State.Running)throw new Error('Proxy container identity mismatch');
  const connections=new Set();let stopping=false;
  const forwarder=net.createServer(socket=>{
    if(stopping||connections.size>=32){socket.destroy();return;}
    connections.add(socket);socket.setTimeout(60000,()=>socket.destroy());
    const code="const n=require('node:net');const s=n.connect(8443,'127.0.0.1',()=>{process.stdin.pipe(s);s.pipe(process.stdout);});s.on('error',()=>process.exit(1));s.on('close',()=>process.exit());process.stdin.on('end',()=>s.end());";
    const child=spawn('docker',['exec','-i',container,'node','-e',code],{stdio:['pipe','pipe','ignore']});
    socket.pipe(child.stdin);child.stdout.pipe(socket);child.stdin.on('error',()=>socket.destroy());child.on('error',()=>socket.destroy());child.on('exit',()=>socket.destroy());
    socket.on('error',()=>{});socket.on('close',()=>{connections.delete(socket);child.kill('SIGTERM');});
  });
  const controller=net.createServer({allowHalfOpen:true},socket=>{
    let data='';socket.setTimeout(2000,()=>socket.destroy());socket.on('error',()=>{});socket.on('data',b=>{data+=b;if(data.length>32)socket.destroy();});
    socket.on('end',()=>{
      if(data==='status\n'){socket.end(JSON.stringify({ready:!stopping,origin:conf.origin,container,network:'internal; exec control channel only'}));return;}
      if(data!=='stop\n'){socket.destroy();return;}
      stopping=true;forwarder.close();for(const connection of connections)connection.destroy();
      socket.end('{"stopped":true}');controller.close(()=>{if(fs.existsSync(control))fs.unlinkSync(control);});
    });
  });
  await new Promise((resolve,reject)=>{forwarder.once('error',reject);forwarder.listen(Number(url.port),'127.0.0.1',resolve);});
  controller.listen(control,()=>fs.chmodSync(control,0o600));
}else throw new Error('Unsupported control tunnel action');
