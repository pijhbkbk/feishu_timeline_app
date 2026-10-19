import { API_BASE_URL } from '../../lib/auth-client';
import { mimeFromBytes } from '../business-sheet/xlsx-images';
import type { SheetImage } from '../business-sheet/image-client';
/** Backgrounds must retain source pixels: thumbnails change the native tile size. */
export async function readBackgroundOriginal(asset:SheetImage,signal:AbortSignal){
  // Attachment uses Prisma cuid(); SheetImage has a separate UUID identity.
  const attachmentId=asset.attachmentId;
  if(!/^(?:c[a-z0-9]{24}|[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})$/i.test(attachmentId))throw new Error('背景图片附件标识无效。');
  const response=await fetch(`${API_BASE_URL}/attachments/${asset.attachmentId}/content`,{credentials:'include',cache:'no-store',signal});
  const mime=response.headers.get('content-type')?.split(';')[0],limit=5*1024*1024;
  if(!response.ok||!['image/png','image/jpeg'].includes(mime??'')||Number(response.headers.get('content-length'))>limit||!response.body){await response.body?.cancel();throw new Error('背景原件读取失败，请检查权限与扫描状态后重新读取。');}
  const reader=response.body.getReader(),chunks:Uint8Array<ArrayBuffer>[]=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit){await reader.cancel();throw new Error('背景原件超过 5 MiB。');}chunks.push(new Uint8Array(value));}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}mimeFromBytes(bytes,mime==='image/png'?'png':'jpeg');
  const url=URL.createObjectURL(new Blob([bytes],{type:mime!}));return {url,release:()=>URL.revokeObjectURL(url)};
}
