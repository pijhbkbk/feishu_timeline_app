import { ImageSourceType, ImageUploadStatusType } from '@univerjs/core';
import { ImageIoService } from '@univerjs/preset-sheets-drawing';
import { sheetThumbnails } from '../business-sheet/thumbnail-client';
import { ThumbnailCache, type ThumbnailLease } from '../business-sheet/thumbnail-cache';
import { uploadSheetImage, defaultImageLayout, listSheetImages } from '../business-sheet/image-client';
import { readBackgroundOriginal } from './background-io';
import type { ImageInsertionGuard } from './image-insertion-guard';
export class WorkbookImageIo extends ImageIoService {
  private failed=new Set<string>();private disposed=false;private leases=new Map<string,ThumbnailLease>();private backgrounds=new Set<string>();private originalLeases=new Map<string,ThumbnailLease>();private originals:ThumbnailCache;private pending=0;private operations=new Map<string,string>();
  private uploadPreviews=new Map<string,string>();
  constructor(private id:string,private changed:(pending:number)=>void,backgroundIds:string[],private failures:(count:number)=>void,private uploadError?:(message:string)=>void,private insertionGuard?:ImageInsertionGuard){super();this.backgrounds=new Set(backgroundIds);this.originals=new ThumbnailCache(async(assetId,signal)=>{const assets=await listSheetImages('SHEET_WORKBOOK',[this.id],signal),asset=assets.find(item=>item.id===assetId&&item.recordId===this.id&&item.targetType==='SHEET_WORKBOOK'&&!item.isDeleted);if(!asset)throw new Error('背景原件不属于当前工作簿。');return await readBackgroundOriginal(asset,signal);},2,32);}
  markBackground(id:string){if(this.backgrounds.size>=32&&!this.backgrounds.has(id))throw new Error('背景图片资源超过 32 个，请保存后重新读取。');this.backgrounds.add(id);}
  override async saveImage(file:File){
    this.changed(++this.pending);
    let imageId:string|undefined;
    try{
      if(this.disposed)throw new Error('图片视图已经关闭。');
      if(!['image/png','image/jpeg'].includes(file.type)||!file.size||file.size>5*1024*1024)throw new Error('图片须为不超过 5 MiB 的 PNG 或 JPEG。');
      imageId=this.insertionGuard?.begin()??crypto.randomUUID();
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');
      if(this.disposed)throw new Error('图片视图已经关闭。');
      const key=`${file.name}:${file.type}:${hash}`;let operationId=this.operations.get(key);
      if(!operationId){
        if(this.operations.size>=50)throw new Error('当前视图已保留 50 个图片上传记录，请保存后重新读取。');
        operationId=crypto.randomUUID();this.operations.set(key,operationId);
      }
      const asset=await uploadSheetImage(file,'SHEET_WORKBOOK',this.id,defaultImageLayout(),operationId,()=>{});
      if(this.disposed)throw new Error('图片视图已经关闭，已上传原件仍保留。');
      this.insertionGuard?.assertCurrent(imageId);
      // Univer's native file/clipboard insertion measures this local preview.
      // Only the scanned asset UUID enters the drawing snapshot; the bounded
      // preview URLs live until this view is disposed and are never persisted.
      let preview=this.uploadPreviews.get(key);
      if(!preview){preview=URL.createObjectURL(file);this.uploadPreviews.set(key,preview);}
      return {imageId,source:asset.id,imageSourceType:ImageSourceType.UUID,base64Cache:preview,status:ImageUploadStatusType.SUCCUSS};
    }catch(error){if(imageId)this.insertionGuard?.release(imageId);if(!this.disposed)this.uploadError?.(error instanceof Error?error.message:'图片上传失败，请重试核实原请求。');throw error;}
    finally{this.changed(--this.pending);}
  }
  override async getImage(id:string){
    if(this.disposed||!/^[a-f\d-]{36}$/i.test(id))throw new Error('图片资源标识无效或视图已经关闭。');
    try{const leases=this.backgrounds.has(id)?this.originalLeases:this.leases,cache=this.backgrounds.has(id)?this.originals:sheetThumbnails;let lease=leases.get(id);if(!lease){lease=cache.acquire(id);leases.set(id,lease);}const url=await lease.get();if(!this.disposed&&this.failed.delete(id))this.failures(this.failed.size);return url;}
    catch(error){if(!this.disposed&&!this.failed.has(id)){this.failed.add(id);this.failures(this.failed.size);}throw error;}
  }
  async retryFailures(){
    const ids=[...this.failed];this.originals.retryFailed(ids);sheetThumbnails.retryFailed(ids);
    const results=await Promise.allSettled(ids.map(id=>this.getImage(id)));
    return {recovered:ids.filter((_id,index)=>results[index]!.status==='fulfilled'),backgrounds:ids.some(id=>this.backgrounds.has(id)),remaining:this.failed.size};
  }
  dispose(){this.disposed=true;for(const lease of [...this.leases.values(),...this.originalLeases.values()])lease.release();this.leases.clear();this.originalLeases.clear();for(const url of this.uploadPreviews.values())URL.revokeObjectURL(url);this.uploadPreviews.clear();this.operations.clear();}
}
