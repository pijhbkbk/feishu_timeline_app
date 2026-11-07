import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HEALTH_TIMEOUT_MS = 3500;
const HEALTH_MAX_BYTES = 16384;
const healthError = () => new Error('Proxy health check failed');

// Probe the actual TLS listener and API route. Trust only this instance's CA;
// never read its private key or print a response/error that could contain data.
export async function checkProxyHealth({origin,ca,identity,port=8443}) {
  try {
    const url=new URL(origin);
    if(!Buffer.isBuffer(ca)||ca.length===0||ca.length>32768||
      url.protocol!=='https:'||url.hostname!=='localhost'||url.origin!==origin||Number(url.port)<1024||
      !/^[a-f0-9]{40}$/.test(identity?.sourceCommit??'')||!/^[a-f0-9]{40}$/.test(identity?.sourceTree??'')||
      !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/.test(identity?.release??'')||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(identity?.buildTime??''))throw healthError();
    await new Promise((resolve,reject)=>{
      let request,response,timer,settled=false;
      const finish=ok=>{
        if(settled)return;settled=true;clearTimeout(timer);
        response?.destroy();request?.destroy();
        if(ok)resolve();else reject(healthError());
      };
      // Total deadline covers connection, TLS, headers and a slow/chunked body.
      timer=setTimeout(()=>finish(false),HEALTH_TIMEOUT_MS);
      try {
        request=https.get({hostname:'127.0.0.1',port,servername:'localhost',path:'/api/health',
          headers:{host:url.host},ca,minVersion:'TLSv1.2',rejectUnauthorized:true,agent:false,maxHeaderSize:8192},incoming=>{
          response=incoming;
          if(incoming.statusCode!==200){finish(false);return;}
          let size=0;const chunks=[];
          incoming.on('data',chunk=>{size+=chunk.length;if(size>HEALTH_MAX_BYTES){finish(false);return;}chunks.push(chunk);});
          incoming.on('aborted',()=>finish(false));incoming.on('error',()=>finish(false));
          incoming.on('end',()=>{
            try {
              const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
              finish(value?.status==='ok'&&value.service==='feishu-timeline-api'&&
                value.runtimeCommit===identity.sourceCommit&&
                ['sourceCommit','sourceTree','release','buildTime'].every(key=>value[key]===identity[key]));
            } catch {finish(false);}
          });
        });
        request.on('error',()=>finish(false));
      } catch {finish(false);}
    });
  } catch {throw healthError();}
}

export function createProxyServer({origin:publicOrigin,privateDomainEnabled=false,cert,key,upstreamAddress=api=>({hostname:api?'api':'web',port:api?3001:3000})}) {
const origin = new URL(publicOrigin);
if(privateDomainEnabled && publicOrigin !== 'https://localhost:18443') throw new Error('Unapproved private proxy origin');
const allowedHosts=new Set([origin.host]);
if(privateDomainEnabled) {allowedHosts.add('timeline.all-too-well.com');allowedHosts.add('timeline.all-too-well.com:443');}
const server = https.createServer({cert,key,minVersion:'TLSv1.2'}, (request,response) => {
  if (!allowedHosts.has(request.headers.host) || !request.url?.startsWith('/') || request.url.startsWith('//')) {
    response.writeHead(400); response.end(); return;
  }
  const headers = {...request.headers};
  for (const name of ['forwarded', 'x-forwarded-for', 'x-real-ip', 'x-forwarded-host', 'x-forwarded-proto', 'proxy-authorization', 'proxy-connection', 'connection', 'upgrade', 'cf-access-jwt-assertion', 'cf-access-authenticated-user-email', 'x-auth-request-user', 'x-auth-request-email']) delete headers[name];
  const api = request.url === '/api' || request.url.startsWith('/api/');
  const upstream = http.request({...upstreamAddress(api),path:request.url, method:request.method, headers, timeout:30000}, incoming => {
    response.writeHead(incoming.statusCode ?? 502, incoming.headers); incoming.pipe(response);
  });
  upstream.on('timeout', () => upstream.destroy());
  upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
  request.on('aborted', () => upstream.destroy());
  request.pipe(upstream);
});
server.requestTimeout = 30000; server.headersTimeout = 10000; server.maxHeadersCount = 100;
return server;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv.length===3&&process.argv[2]==='--healthcheck') {
    try {
      await checkProxyHealth({origin:process.env.PUBLIC_ORIGIN,ca:fs.readFileSync('/run/tls.crt'),identity:{
        sourceCommit:process.env.EXPECTED_SOURCE_COMMIT,sourceTree:process.env.EXPECTED_SOURCE_TREE,
        release:process.env.EXPECTED_RELEASE,buildTime:process.env.EXPECTED_BUILD_TIME,
      }});
    } catch {console.error('Proxy health check failed');process.exitCode=1;}
  } else if(process.argv.length===2) {
    if(![undefined,'1'].includes(process.env.Y9000P_PRIVATE_DOMAIN_ENABLED)) throw new Error('Unapproved private domain flag');
    createProxyServer({origin:process.env.PUBLIC_ORIGIN,privateDomainEnabled:process.env.Y9000P_PRIVATE_DOMAIN_ENABLED==='1',cert:fs.readFileSync('/run/tls.crt'),key:fs.readFileSync('/run/tls.key')}).listen(8443,'0.0.0.0');
  } else {console.error('Unsupported proxy operation');process.exitCode=1;}
}
