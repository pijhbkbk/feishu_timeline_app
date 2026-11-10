// Loopback-only frontend over the existing API. No mock auth, local database or saved facts.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {mkdir,readFile,writeFile,realpath} from 'node:fs/promises';
import http from 'node:http';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const require=createRequire(await realpath(join(root,'apps/web/node_modules/vite/package.json')));
const {build}=require('esbuild'),out=join(root,'var/table-first-service-20261110/site');await mkdir(out,{recursive:true});
await build({entryPoints:[join(root,'apps/web/src/features/table-first-service/app.tsx')],bundle:true,platform:'browser',format:'esm',outfile:join(out,'app.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_API_BASE_URL':'"/api"'},minify:true});
await writeFile(join(out,'index.html'),'<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>轻卡定制色 · 隔离业务预览</title><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script></html>');
const identity=require(join(root,'apps/api/dist/common/build-identity.generated.js')).IMMUTABLE_BUILD_IDENTITY;
await writeFile(join(out,'build-info.json'),JSON.stringify(identity));
if(process.argv.includes('--build-only'))process.exit(0);
const allowed={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/app.css':'app.css','/build-info':'build-info.json'};
const server=http.createServer(async(req,res)=>{
 if(req.headers.host!=='127.0.0.1:3500'){res.writeHead(421);res.end();return;}
 const url=new URL(req.url,'http://127.0.0.1:3500');
 if(url.pathname.startsWith('/api/')){const upstream=http.request({hostname:'127.0.0.1',port:3501,path:url.pathname+url.search,method:req.method,headers:{...req.headers,host:'127.0.0.1:3501'}},response=>{res.writeHead(response.statusCode??502,response.headers);response.pipe(res);});upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'隔离业务服务不可用；未提交输入保留。'}));});req.on('aborted',()=>upstream.destroy());req.pipe(upstream);return;}
 if(req.method!=='GET'||!allowed[url.pathname]){res.writeHead(404);res.end();return;}
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'");res.setHeader('Content-Type',url.pathname==='/build-info'?'application/json; charset=utf-8':url.pathname.endsWith('.js')?'text/javascript; charset=utf-8':url.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');res.end(await readFile(join(out,allowed[url.pathname])));
});server.listen(3500,'127.0.0.1',()=>console.log('Isolated business preview: http://127.0.0.1:3500/#review'));
