import { beforeEach, expect, it, vi } from 'vitest';
const transport=vi.hoisted(()=>({thumbnail:vi.fn(),original:vi.fn(),list:vi.fn(),upload:vi.fn()}));
vi.mock('@univerjs/core',()=>({ImageSourceType:{UUID:'UUID'},ImageUploadStatusType:{SUCCUSS:1}}));
vi.mock('@univerjs/preset-sheets-drawing',()=>({ImageIoService:class {}}));
vi.mock('../business-sheet/thumbnail-client',async()=>{const {ThumbnailCache}=await import('../business-sheet/thumbnail-cache');return {sheetThumbnails:new ThumbnailCache((id,signal)=>transport.thumbnail(id,signal),2,128)};});
vi.mock('../business-sheet/image-client',()=>({listSheetImages:transport.list,uploadSheetImage:transport.upload,defaultImageLayout:()=>({})}));
vi.mock('./background-io',()=>({readBackgroundOriginal:transport.original}));
import { WorkbookImageIo } from './image-io';
const book='11111111-1111-4111-8111-111111111111';
beforeEach(()=>Object.values(transport).forEach(mock=>mock.mockReset()));
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
