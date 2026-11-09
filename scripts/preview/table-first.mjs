// Isolated, loopback-only UI preview. No application server, credentials or business API.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {mkdir,readFile,writeFile,realpath} from 'node:fs/promises';
import http from 'node:http';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const require=createRequire(await realpath(join(root,'apps/web/node_modules/vite/package.json')));
const {build}=require('esbuild');
const out=join(root,'var/table-first-preview-20261109/site');await mkdir(out,{recursive:true});
await build({entryPoints:[join(root,'apps/web/src/features/table-first-preview/app.tsx')],bundle:true,platform:'browser',format:'esm',outfile:join(out,'app.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},minify:true});
await writeFile(join(out,'index.html'),'<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>轻卡定制色 · 表格交互预览</title><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script></html>');
if(process.argv.includes('--build-only'))process.exit(0);
const allowed={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/app.css':'app.css'};
const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://127.0.0.1');if(req.method!=='GET'||!allowed[url.pathname]){res.writeHead(404);res.end();return;}res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'");res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript; charset=utf-8':url.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');res.end(await readFile(join(out,allowed[url.pathname])));});
server.listen(3499,'127.0.0.1',()=>console.log('Table-first isolated preview: http://127.0.0.1:3499/#review'));
