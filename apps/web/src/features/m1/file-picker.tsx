'use client';
import React, { useRef } from 'react';
import { M1Icon } from './icon';
export function M1FilePicker({label,file,disabled,onChange}:{label:string;file:File|null;disabled?:boolean;onChange:(file:File|null)=>void}) {
  const input = useRef<HTMLInputElement>(null);
  return <div className="m1-file-picker"><input ref={input} hidden aria-label={label} type="file" accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx" disabled={disabled} onChange={event=>onChange(event.target.files?.[0]??null)}/><button type="button" className="m1-button" disabled={disabled} onClick={()=>input.current?.click()}><M1Icon name="file"/>选择文件</button><span>{file?.name||'未选择文件'}</span></div>;
}
