import 'reflect-metadata';
import { request as httpRequest } from 'node:http';
import { Body,Controller,Module,Post,Put } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { beforeAll,afterAll,it,expect } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { workbookBody } from './workbook-body.middleware';
@Controller()
class BodyController { @Post('workbooks') workbook(@Body() body:{value?:string}){return {bytes:body.value?.length};} @Put('workbooks/:id') save(@Body() body:{value?:string}){return {bytes:body.value?.length};} @Put('workbooks/:id/draft') draft(@Body() body:{value?:string}){return {bytes:body.value?.length};} @Post('other') other(){return {ok:true};} }
@Module({controllers:[BodyController]})class TestModule{}
let app:INestApplication,base:string;
// The parser rejects an oversized declared length before reading its body.
// Observe that HTTP response without racing an 8 MiB client write against the
// server's intentional close; an EPIPE is never accepted in place of a 413.
function declaredOversizeStatus(){return new Promise<number>((resolve,reject)=>{
 const request=httpRequest(base+'/api/workbooks',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':8*1024*1024+1}},response=>{const status=response.statusCode;response.resume();if(status===undefined)reject(new Error('Missing HTTP status'));else resolve(status);});
 request.on('error',reject);request.setTimeout(3000,()=>{const error=new Error('Oversize rejection timed out');request.destroy(error);reject(error);});request.flushHeaders();
});}
beforeAll(async()=>{app=await NestFactory.create(TestModule,{logger:false});app.setGlobalPrefix('api');app.use(workbookBody);await app.listen(0,'127.0.0.1');base=await app.getUrl();});afterAll(async()=>{await app?.close();});
it('reads a complete >100KB snapshot only for exact workbook create/save routes',async()=>{const body=JSON.stringify({value:'中'.repeat(120000)});for(const path of ['/api/workbooks','/api/workbooks/10000000-0000-4000-8000-000000000001','/api/workbooks/10000000-0000-4000-8000-000000000001/draft']){const response=await fetch(base+path,{method:path==='/api/workbooks'?'POST':'PUT',headers:{'Content-Type':'application/json'},body});expect(response.status).toBeLessThan(300);expect(await response.json()).toEqual({bytes:120000});}expect((await fetch(base+'/api/other',{method:'POST',headers:{'Content-Type':'application/json'},body})).status).toBe(413);});
it('rejects declared oversize before reading, compressed and invalid JSON bodies',async()=>{expect(await declaredOversizeStatus()).toBe(413);expect((await fetch(base+'/api/workbooks',{method:'POST',headers:{'Content-Type':'application/json','Content-Encoding':'gzip'},body:'{}'})).status).toBe(415);expect((await fetch(base+'/api/workbooks',{method:'POST',headers:{'Content-Type':'application/json'},body:'bad'})).status).toBe(400);});

it('does not enlarge publish, delete or unrelated nested workbook bodies',async()=>{const body=JSON.stringify({value:'x'.repeat(120000)});for(const [method,path] of [['POST','/api/workbooks/10000000-0000-4000-8000-000000000001/draft/publish'],['DELETE','/api/workbooks/10000000-0000-4000-8000-000000000001/draft'],['PUT','/api/workbooks/10000000-0000-4000-8000-000000000001/draft/other']] as const)expect((await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body})).status).toBe(413);});
