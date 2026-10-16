import { BadRequestException } from '@nestjs/common';
import { identity, object, positiveInt, textField } from '../modules/color-register/color-register.rules';
export type BusinessFactSource = { fileName:string; sheetName:string; rowNumbers:number[]; fileHash:string };
/** Informational import provenance only, supplied at creation; never a path or authorization source. */
export function parseBusinessFactSource(raw:unknown):BusinessFactSource|null {
  if(raw===undefined||raw===null)return null;
  const value=object(raw,'来源');
  if(Object.keys(value).some(key=>!['fileName','sheetName','rowNumbers','fileHash'].includes(key)))throw new BadRequestException('来源字段不正确。');
  const fileName=textField(value.fileName,'来源文件名',255,true)!;
  const sheetName=textField(value.sheetName,'来源工作表',200,true)!;
  if(typeof value.fileHash!=='string'||! /^[0-9a-fA-F]{64}$/.test(value.fileHash))throw new BadRequestException('来源文件摘要须为 SHA-256。');
  if(!Array.isArray(value.rowNumbers)||!value.rowNumbers.length||value.rowNumbers.length>200)throw new BadRequestException('来源行号须有 1–200 项。');
  const rowNumbers=value.rowNumbers.map(row=>positiveInt(row,'来源行号',1048576)).sort((a,b)=>a-b);
  if(new Set(rowNumbers).size!==rowNumbers.length)throw new BadRequestException('来源行号不能重复。');
  // Validate against ordinary identity-like hashes without trusting them as record identity.
  return {fileName,sheetName,rowNumbers,fileHash:identity(value.fileHash.toLowerCase(),'来源文件摘要')};
}
