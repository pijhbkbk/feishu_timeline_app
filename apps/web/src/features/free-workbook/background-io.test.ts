import { afterEach,describe,expect,it,vi } from 'vitest';
import { readBackgroundOriginal } from './background-io';
import type { SheetImage } from '../business-sheet/image-client';
const asset={attachmentId:'30000000-0000-4000-8000-000000000003'} as SheetImage;
const pixel=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6mgAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
afterEach(()=>vi.unstubAllGlobals());
describe('bounded original background I/O',()=>{
 it('loads original PNG pixels and releases the object URL',async()=>{const fetch=vi.fn(async()=>new Response(pixel,{headers:{'content-type':'image/png'}}));vi.stubGlobal('fetch',fetch);const result=await readBackgroundOriginal(asset,new AbortController().signal);expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/attachments/30000000-0000-4000-8000-000000000003/content'),expect.objectContaining({credentials:'include',cache:'no-store'}));expect(result.url.startsWith('blob:')).toBe(true);result.release();});
 it.each([403,409,503])('does not bypass failed authorization or scanning status %s',async status=>{vi.stubGlobal('fetch',async()=>new Response('',{status}));await expect(readBackgroundOriginal(asset,new AbortController().signal)).rejects.toThrow('扫描状态');});
 it('rejects a streamed oversized original before creating an image URL',async()=>{const cancel=vi.fn(),stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(5*1024*1024+1));},cancel});vi.stubGlobal('fetch',async()=>new Response(stream,{headers:{'content-type':'image/png'}}));await expect(readBackgroundOriginal(asset,new AbortController().signal)).rejects.toThrow('5 MiB');expect(cancel).toHaveBeenCalled();});
});
