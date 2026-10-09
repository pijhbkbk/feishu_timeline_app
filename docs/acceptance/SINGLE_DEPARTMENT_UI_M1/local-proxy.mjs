import http from 'node:http';
const origin = new URL('http://127.0.0.1:3350');
const server = http.createServer((request,response) => {
  if (request.headers.host !== origin.host || !request.url?.startsWith('/') || request.url.startsWith('//')) {
    response.writeHead(400); response.end(); return;
  }
  const headers = {...request.headers};
  if ((request.headers['user-agent']??'').includes('Safari') && !(request.headers['user-agent']??'').includes('Chrome')) {
    const route=new URL(request.url,origin).pathname;
    response.once('finish',()=>console.log(JSON.stringify({browser:'Safari',method:request.method,path:route,status:response.statusCode,time:new Date().toISOString()})));
  }
  for (const name of ['forwarded','x-forwarded-for','x-real-ip','x-forwarded-host','x-forwarded-proto','proxy-authorization','proxy-connection','connection','upgrade']) delete headers[name];
  const api = request.url === '/api' || request.url.startsWith('/api/');
  const upstream = http.request({hostname:'127.0.0.1',port:api?3351:3352,path:request.url,method:request.method,headers,timeout:150000}, incoming => {
    const responseHeaders={...incoming.headers};
    // This proxy is explicitly loopback HTTP, bound to 127.0.0.1 with an exact
    // Host allowlist above. Keep the production nonce CSP, but do not upgrade
    // this local preview's same-origin assets to an HTTPS listener that does not exist.
    // API Origin/session/security headers are passed through unchanged.
    if (!api && request.socket.localAddress==='127.0.0.1' && request.headers.host===origin.host && typeof responseHeaders['content-security-policy']==='string') {
      responseHeaders['content-security-policy']=responseHeaders['content-security-policy'].split(';').filter(d=>d.trim().toLowerCase()!=='upgrade-insecure-requests').join(';');
    }
    response.writeHead(incoming.statusCode ?? 502,responseHeaders);incoming.pipe(response);
  });
  upstream.on('timeout',()=>upstream.destroy());
  upstream.on('error',()=>{if(!response.headersSent)response.writeHead(502,{'Content-Type':'application/json'});response.end(JSON.stringify({message:'本地服务暂时不可用，请稍后重试'}));});
  request.on('aborted',()=>upstream.destroy());request.pipe(upstream);
});
server.requestTimeout=150000;server.headersTimeout=10000;server.maxHeadersCount=100;
server.listen(3350,'127.0.0.1',()=>console.log('M1 loopback preview: http://127.0.0.1:3350'));
for(const sig of ['SIGINT','SIGTERM']) process.on(sig,()=>server.close(()=>process.exit(0)));
