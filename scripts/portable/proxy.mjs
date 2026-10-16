import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
const origin = new URL(process.env.PUBLIC_ORIGIN);
const server = https.createServer({cert:fs.readFileSync('/run/tls.crt'), key:fs.readFileSync('/run/tls.key'), minVersion:'TLSv1.2'}, (request,response) => {
  if (request.headers.host !== origin.host || !request.url?.startsWith('/') || request.url.startsWith('//')) {
    response.writeHead(400); response.end(); return;
  }
  const headers = {...request.headers};
  for (const name of ['forwarded', 'x-forwarded-for', 'x-real-ip', 'x-forwarded-host', 'x-forwarded-proto', 'proxy-authorization', 'proxy-connection', 'connection', 'upgrade']) delete headers[name];
  const api = request.url === '/api' || request.url.startsWith('/api/');
  const upstream = http.request({hostname:api?'api':'web', port:api?3001:3000, path:request.url, method:request.method, headers, timeout:30000}, incoming => {
    response.writeHead(incoming.statusCode ?? 502, incoming.headers); incoming.pipe(response);
  });
  upstream.on('timeout', () => upstream.destroy());
  upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
  request.on('aborted', () => upstream.destroy());
  request.pipe(upstream);
});
server.requestTimeout = 30000; server.headersTimeout = 10000; server.maxHeadersCount = 100;
server.listen(8443, '0.0.0.0');
