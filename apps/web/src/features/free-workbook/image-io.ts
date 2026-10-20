import { ImageSourceType, ImageUploadStatusType } from '@univerjs/core';
import { ImageIoService } from '@univerjs/preset-sheets-drawing';
import { sheetThumbnails } from '../business-sheet/thumbnail-client';
import { ThumbnailCache, type ThumbnailLease } from '../business-sheet/thumbnail-cache';
import { uploadSheetImage, defaultImageLayout, listSheetImages } from '../business-sheet/image-client';
import { readBackgroundOriginal } from './background-io';
export class WorkbookImageIo extends ImageIoService {
  private failed=new Set<string>();private disposed=false;private leases=new Map<string,ThumbnailLease>();private backgrounds=new Set<string>();private originalLeases=new Map<string,ThumbnailLease>();private originals:ThumbnailCache;private pending=0;private operations=new Map<string,string>();
  constructor(private id:string,private changed:(pending:number)=>void,backgroundIds:string[],private failures:(count:number)=>void){super();this.backgrounds=new Set(backgroundIds);this.originals=new ThumbnailCache(async(assetId,signal)=>{const assets=await listSheetImages('SHEET_WORKBOOK',[this.id],signal),asset=assets.find(item=>item.id===assetId&&item.recordId===this.id&&item.targetType==='SHEET_WORKBOOK'&&!item.isDeleted);if(!asset)throw new Error('背景原件不属于当前工作簿。');return await readBackgroundOriginal(asset,signal);},2,32);}
  markBackground(id:string){if(this.backgrounds.size>=32&&!this.backgrounds.has(id))throw new Error('背景图片资源超过 32 个，请保存后重新读取。');this.backgrounds.add(id);}
  override async saveImage(file:File){this.changed(++this.pending);try{const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');const key=`${file.name}:${file.type}:${hash}`;let operationId=this.operations.get(key);if(!operationId){operationId=crypto.randomUUID();this.operations.set(key,operationId);}const asset=await uploadSheetImage(file,'SHEET_WORKBOOK',this.id,defaultImageLayout(),operationId,()=>{});return {imageId:asset.id,source:asset.id,imageSourceType:ImageSourceType.UUID,base64Cache:'',status:ImageUploadStatusType.SUCCUSS};}finally{this.changed(--this.pending);}}
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
  dispose(){this.disposed=true;for(const lease of [...this.leases.values(),...this.originalLeases.values()])lease.release();this.leases.clear();this.originalLeases.clear();}
}
