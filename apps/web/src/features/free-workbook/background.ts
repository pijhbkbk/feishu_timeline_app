import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { strFromU8, strToU8 } from 'fflate';
import { mimeFromBytes, imageDimensions, type EmbeddedImage } from '../business-sheet/xlsx-images';
import { WORKBOOK_LIMITS } from './contract';

export type WorkbookImportImage = EmbeddedImage & { background?: { scaleX:number;scaleY:number } };
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const array=(value:unknown):unknown[]=>value===undefined?[]:Array.isArray(value)?value:[value];
const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',removeNSPrefix:true,processEntities:false,parseTagValue:false,parseAttributeValue:false});
function xml(files:Readonly<Record<string,Uint8Array>>,path:string){const bytes=files[path];if(!bytes)throw new Error('背景图片缺少 XML 部件。');const source=strFromU8(bytes);if(/<!DOCTYPE|<!ENTITY/i.test(source)||XMLValidator.validate(source)!==true)throw new Error('背景图片 XML 无效。');return {source,data:object(parser.parse(source))};}
function part(from:string,target:unknown){
  if(typeof target!=='string'||!target||/[\\\0?#]/.test(target)||/^[a-z][a-z\d+.-]*:/i.test(target)||target.startsWith('//'))throw new Error('背景图片关系路径无效。');
  let decoded:string;try{decoded=decodeURIComponent(target);}catch{throw new Error('背景图片路径编码无效。');}
  if(/[\\\0?#]/.test(decoded))throw new Error('背景图片路径编码无效。');const segments=decoded.startsWith('/')?[]:from.split('/').slice(0,-1);
  for(const item of decoded.split('/')){if(!item||item==='.')continue;if(item==='..'){if(!segments.length)throw new Error('背景图片路径越界。');segments.pop();}else segments.push(item);}
  const result=segments.join('/');if(!result.startsWith('xl/'))throw new Error('背景图片路径越界。');return result;
}
function relations(files:Readonly<Record<string,Uint8Array>>,from:string){const segments=from.split('/'),name=segments.pop()!,path=[...segments,'_rels',`${name}.rels`].join('/');const result=new Map<string,{type:string;target:string}>();if(!files[path])return result;
  for(const raw of array(object(xml(files,path).data.Relationships).Relationship)){const item=object(raw),id=item['@_Id'];if(typeof id!=='string'||!id||result.has(id)||item['@_TargetMode']!==undefined&&item['@_TargetMode']!=='Internal')throw new Error('背景图片关系重复、无效或为外链。');result.set(id,{type:String(item['@_Type']),target:part(from,item['@_Target'])});}return result;
}
/** Excel tiles using physical DPI. Keep original bytes and the matching 96-DPI layout scale. */
export function backgroundScale(bytes:Uint8Array):{scaleX:number;scaleY:number}{
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let x=0,y=0;
  if(bytes[0]===137){for(let offset=8;offset+12<=bytes.length;){const length=view.getUint32(offset),end=offset+12+length;if(end>bytes.length)throw new Error('背景 PNG 数据段不完整。');const kind=String.fromCharCode(...bytes.subarray(offset+4,offset+8));if(kind==='eXIf')throw new Error('暂不支持带 Exif 分辨率或旋转信息的背景图片；源文件未修改。');if(kind==='pHYs'&&length===9&&bytes[offset+16]===1){x=view.getUint32(offset+8)*0.0254;y=view.getUint32(offset+12)*0.0254;}offset=end;}}
  else if(bytes[0]===255){for(let offset=2;offset+4<=bytes.length;){if(bytes[offset++]!==255)break;while(bytes[offset]===255)offset++;const marker=bytes[offset++]!;if(marker===217||marker===218)break;if(marker===1||marker>=208&&marker<=215)continue;const length=view.getUint16(offset),start=offset+2;if(length<2||offset+length>bytes.length)throw new Error('背景 JPEG 数据段不完整。');if(marker===225&&length>=8&&String.fromCharCode(...bytes.subarray(start,start+6))==='Exif\0\0')throw new Error('暂不支持带 Exif 分辨率或旋转信息的背景图片；源文件未修改。');if(marker===224&&length>=16&&String.fromCharCode(...bytes.subarray(start,start+5))==='JFIF\0'){const unit=bytes[start+7],factor=unit===1?1:unit===2?2.54:0;x=view.getUint16(start+8)*factor;y=view.getUint16(start+10)*factor;}offset+=length;}}
  const scale={scaleX:x?96/x:1,scaleY:y?96/y:1};if(Object.values(scale).some(value=>!Number.isFinite(value)||value<0.01||value>100))throw new Error('背景图片物理尺寸超限。');return scale;
}
/** Extract backgrounds separately, then pass only drawings to the unchanged business-image reader. */
export function readWorkbookBackgrounds(files:Readonly<Record<string,Uint8Array>>){
  const originals=new Set<string>();let originalBytes=0,originalPixels=0;
  const images:WorkbookImportImage[]=[],drawingFiles={...files},wb='xl/workbook.xml',links=relations(files,wb);let represented=0;
  for(const raw of array(object(object(xml(files,wb).data.workbook).sheets).sheet)){const sheet=object(raw),link=links.get(String(sheet['@_id']));if(!link||!link.type.endsWith('/worksheet'))throw new Error('背景工作表关系无效。');const {source,data}=xml(files,link.target),pictures=array(object(data.worksheet).picture);if(!pictures.length)continue;if(pictures.length!==1)throw new Error('每张工作表只能有一张背景图片。');
    const picture=object(pictures[0]);if(Object.keys(picture).some(key=>key!=='@_id'))throw new Error('背景图片包含未支持属性。');const relation=relations(files,link.target).get(String(picture['@_id']));if(!relation||!relation.type.endsWith('/image')||!/^xl\/media\/[^/]+\.(png|jpe?g)$/i.test(relation.target))throw new Error('背景图片媒体关系缺失或格式不支持。');const bytes=files[relation.target];if(!bytes)throw new Error('背景图片原件缺失。');const mime=mimeFromBytes(bytes,relation.target.split('.').pop());if(!originals.has(relation.target)){const size=imageDimensions(bytes,mime);originals.add(relation.target);originalBytes+=bytes.length;originalPixels+=size.width*size.height;if(originalBytes>20*1024*1024||originalPixels>40_000_000)throw new Error('背景原件合计超过 20 MiB 或 40 MP。');}const scale=backgroundScale(bytes),sheetId=String(sheet['@_sheetId']);
    images.push({imageKey:`background:${sheetId}`,sheetId,sheetName:String(sheet['@_name']),sourceMediaId:relation.target,bytes:new Uint8Array(bytes),mime,background:scale,anchor:null,occupiedRows:null,target:null,status:'ready',issues:[]});if(images.length>WORKBOOK_LIMITS.sheets)throw new Error('背景图片数量超限。');
    let removed=0;drawingFiles[link.target]=strToU8(source.replace(/<(?:[\w.-]+:)?picture\b[^>]*\/>|<(?:[\w.-]+:)?picture\b[^>]*>\s*<\/(?:[\w.-]+:)?picture\s*>/g,()=>{removed++;return '';}));if(removed!==1)throw new Error('背景图片结构不能完整读取。');represented++;
  }
  const declared=Object.entries(files).filter(([path])=>/^xl\/worksheets\/[^/]+\.xml$/.test(path)).reduce((count,[,bytes])=>count+[...strFromU8(bytes).matchAll(/<(?:[\w.-]+:)?picture\b/g)].length,0);if(declared!==represented)throw new Error('部分背景图片没有对应工作表；未创建编辑副本。');return {images,drawingFiles};
}
