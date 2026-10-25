import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const transport=vi.hoisted(()=>({thumbnail:vi.fn(),original:vi.fn(),list:vi.fn(),upload:vi.fn()}));
vi.mock('@univerjs/core',()=>({ImageSourceType:{UUID:'UUID'},ImageUploadStatusType:{SUCCUSS:1}}));
vi.mock('@univerjs/preset-sheets-drawing',()=>({ImageIoService:class {}}));
vi.mock('../business-sheet/thumbnail-client',async()=>{const {ThumbnailCache}=await import('../business-sheet/thumbnail-cache');return {sheetThumbnails:new ThumbnailCache((id,signal)=>transport.thumbnail(id,signal),2,128)};});
vi.mock('../business-sheet/image-client',()=>({listSheetImages:transport.list,uploadSheetImage:transport.upload,defaultImageLayout:()=>({})}));
vi.mock('./background-io',()=>({readBackgroundOriginal:transport.original}));
import { WorkbookImageIo } from './image-io';
import { ImageInsertionGuard } from './image-insertion-guard';
const book='11111111-1111-4111-8111-111111111111';
beforeEach(()=>Object.values(transport).forEach(mock=>mock.mockReset()));
afterEach(()=>vi.restoreAllMocks());
it('does not retry failed thumbnails on repaint, but explicitly retries and reuses the recovered URL',async()=>{
 const id=crypto.randomUUID(),notify=vi.fn(),release=vi.fn();transport.thumbnail.mockRejectedValueOnce(new Error('429')).mockResolvedValueOnce({url:'blob:recovered',release});const io=new WorkbookImageIo(book,vi.fn(),[],notify);
 for(let i=0;i<10;i++)await expect(io.getImage(id)).rejects.toThrow('429');expect(transport.thumbnail).toHaveBeenCalledTimes(1);expect(notify).toHaveBeenCalledTimes(1);expect(notify).toHaveBeenLastCalledWith(1);
 expect(await io.retryFailures()).toEqual({recovered:[id],backgrounds:false,remaining:0});expect(await io.getImage(id)).toBe('blob:recovered');expect(transport.thumbnail).toHaveBeenCalledTimes(2);expect(notify).toHaveBeenLastCalledWith(0);io.dispose();expect(release).toHaveBeenCalledOnce();
});
it('revalidates background ownership and reads originals on explicit retry without falling back to thumbnails',async()=>{
 const id=crypto.randomUUID(),notify=vi.fn(),io=new WorkbookImageIo(book,vi.fn(),[id],notify);transport.list.mockResolvedValueOnce([{id,targetType:'SHEET_WORKBOOK',recordId:'another-book'}]).mockResolvedValueOnce([{id,targetType:'SHEET_WORKBOOK',recordId:book}]);transport.original.mockResolvedValueOnce({url:'blob:original',release:vi.fn()});await expect(io.getImage(id)).rejects.toThrow('不属于');expect(transport.original).not.toHaveBeenCalled();expect(await io.retryFailures()).toEqual({recovered:[id],backgrounds:true,remaining:0});expect(transport.list).toHaveBeenCalledTimes(2);expect(transport.thumbnail).not.toHaveBeenCalled();io.dispose();
});
it('retains a second failed read for another explicit retry without an automatic loop',async()=>{
 const id=crypto.randomUUID(),io=new WorkbookImageIo(book,vi.fn(),[],vi.fn());transport.thumbnail.mockRejectedValue(new Error('offline'));await expect(io.getImage(id)).rejects.toThrow();expect(await io.retryFailures()).toEqual({recovered:[],backgrounds:false,remaining:1});for(let i=0;i<5;i++)await expect(io.getImage(id)).rejects.toThrow();expect(transport.thumbnail).toHaveBeenCalledTimes(2);io.dispose();
});
it('does not report an old view failure after disposal',async()=>{
 const id=crypto.randomUUID(),notify=vi.fn();let reject!:(error:Error)=>void;transport.thumbnail.mockImplementation(()=>new Promise((_resolve,fail)=>{reject=fail;}));const io=new WorkbookImageIo(book,vi.fn(),[],notify),read=io.getImage(id);await Promise.resolve();io.dispose();reject(new Error('aborted'));await expect(read).rejects.toThrow();expect(notify).not.toHaveBeenCalled();
});
const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6mgAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
const imageFile=(name='synthetic.png')=>new File([png],name,{type:'image/png'});
it('gives native paste readable image bytes after upload while persisting only the asset UUID',async()=>{
 const id=crypto.randomUUID(),changed=vi.fn(),io=new WorkbookImageIo(book,changed,[],vi.fn());transport.upload.mockResolvedValue({id});
 const result=await io.saveImage(imageFile());
 expect(result).toMatchObject({source:id,imageSourceType:'UUID',status:1});expect(result.imageId).not.toBe(id);expect(result.base64Cache.startsWith('blob:')).toBe(true);
 expect(new Uint8Array(await (await fetch(result.base64Cache)).arrayBuffer())).toEqual(png);
 expect(changed.mock.calls.map(([count])=>count)).toEqual([1,0]);
 io.dispose();await expect(fetch(result.base64Cache)).rejects.toThrow();
});
it('reuses upload idempotency and preview but gives each intentional insertion a distinct drawing ID',async()=>{
 const id=crypto.randomUUID(),io=new WorkbookImageIo(book,vi.fn(),[],vi.fn());transport.upload.mockResolvedValue({id});
 const first=await io.saveImage(imageFile()),second=await io.saveImage(imageFile());
 expect(first.source).toBe(second.source);expect(first.imageId).not.toBe(second.imageId);expect(first.base64Cache).toBe(second.base64Cache);
 expect(transport.upload.mock.calls[0]![4]).toBe(transport.upload.mock.calls[1]![4]);io.dispose();
});
it('does not create a preview before scanning succeeds and retains the operation for explicit retry',async()=>{
 const create=vi.spyOn(URL,'createObjectURL'),report=vi.fn(),io=new WorkbookImageIo(book,vi.fn(),[],vi.fn(),report);
 transport.upload.mockRejectedValueOnce(new Error('scan unavailable')).mockResolvedValueOnce({id:crypto.randomUUID()});
 await expect(io.saveImage(imageFile())).rejects.toThrow('scan unavailable');expect(create).not.toHaveBeenCalled();expect(report).toHaveBeenCalledWith('scan unavailable');
 await io.saveImage(imageFile());expect(transport.upload.mock.calls[0]![4]).toBe(transport.upload.mock.calls[1]![4]);expect(create).toHaveBeenCalledOnce();io.dispose();
});
it('does not return a drawing or leak a preview when disposed during upload',async()=>{
 let resolve!:(asset:{id:string})=>void;const create=vi.spyOn(URL,'createObjectURL'),report=vi.fn(),changed=vi.fn(),io=new WorkbookImageIo(book,changed,[],vi.fn(),report);
 transport.upload.mockImplementation(()=>new Promise(done=>{resolve=done;}));const saving=io.saveImage(imageFile());
 await vi.waitFor(()=>expect(transport.upload).toHaveBeenCalledOnce());io.dispose();resolve({id:crypto.randomUUID()});
 await expect(saving).rejects.toThrow('视图已经关闭');expect(create).not.toHaveBeenCalled();expect(report).not.toHaveBeenCalled();expect(changed).toHaveBeenLastCalledWith(0);
});
it('captures the destination before hashing/upload and rejects a changed sheet while keeping the original retry operation',async()=>{
 let sheetId='first',resolve!:(asset:{id:string})=>void;const guard=new ImageInsertionGuard(()=>({unitId:book,sheetId,selection:'A1',revision:0})),report=vi.fn(),create=vi.spyOn(URL,'createObjectURL'),io=new WorkbookImageIo(book,vi.fn(),[],vi.fn(),report,guard);
 const asset={id:crypto.randomUUID()};transport.upload.mockImplementationOnce(()=>new Promise(done=>{resolve=done;})).mockResolvedValue(asset);
 const saving=io.saveImage(imageFile());await vi.waitFor(()=>expect(transport.upload).toHaveBeenCalledOnce());sheetId='second';resolve(asset);
 await expect(saving).rejects.toThrow('工作表');expect(create).not.toHaveBeenCalled();expect(report).toHaveBeenCalledWith(expect.stringContaining('原件保留'));
 sheetId='first';const image=await io.saveImage(imageFile());expect(transport.upload.mock.calls[0]![4]).toBe(transport.upload.mock.calls[1]![4]);
 guard.assertCurrent(image.imageId);sheetId='second';expect(()=>guard.validate([{drawingId:image.imageId,unitId:book,subUnitId:'first'}])).toThrow('原位置');io.dispose();guard.dispose();
});
it.each([new File(['x'],'unsupported.svg',{type:'image/svg+xml'}),new File([],'empty.png',{type:'image/png'}),new File([new Uint8Array(5*1024*1024+1)],'large.png',{type:'image/png'})])('bounds incoming image bytes before hashing or upload: $name',async file=>{
 const read=vi.spyOn(file,'arrayBuffer'),io=new WorkbookImageIo(book,vi.fn(),[],vi.fn());await expect(io.saveImage(file)).rejects.toThrow('5 MiB');expect(read).not.toHaveBeenCalled();expect(transport.upload).not.toHaveBeenCalled();io.dispose();
});
it('bounds preview and retry records, keeps a known retry usable, and releases all previews',async()=>{
 const revoke=vi.spyOn(URL,'revokeObjectURL'),io=new WorkbookImageIo(book,vi.fn(),[],vi.fn());transport.upload.mockResolvedValue({id:crypto.randomUUID()});
 for(let n=0;n<50;n++)await io.saveImage(imageFile(`synthetic-${n}.png`));
 await expect(io.saveImage(imageFile('synthetic-50.png'))).rejects.toThrow('50');expect(transport.upload).toHaveBeenCalledTimes(50);
 await io.saveImage(imageFile('synthetic-0.png'));expect(transport.upload).toHaveBeenCalledTimes(51);
 io.dispose();expect(revoke).toHaveBeenCalledTimes(50);await expect(io.saveImage(imageFile())).rejects.toThrow('视图已经关闭');expect(transport.upload).toHaveBeenCalledTimes(51);
});
