import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { WorkbookCanvas as CanvasComponent } from './canvas';
import type { WorkbookRuntime } from './runtime';

const hooks=vi.hoisted(()=>({slots:[] as unknown[],index:0,effects:[] as Array<()=>void>,cleanups:new Map<number,()=>void>()}));
const fonts=vi.hoisted(()=>({prepare:vi.fn()}));
vi.mock('react',async()=>{
  const actual=await vi.importActual<typeof import('react')>('react');
  return {...actual,
    useState:<T,>(initial:T)=>{const i=hooks.index++;if(!(i in hooks.slots))hooks.slots[i]=initial;return[hooks.slots[i],(value:T|((old:T)=>T))=>{hooks.slots[i]=typeof value==='function'?(value as (old:T)=>T)(hooks.slots[i] as T):value;}];},
    useRef:<T,>(initial:T)=>{const i=hooks.index++;if(!(i in hooks.slots))hooks.slots[i]={current:initial};return hooks.slots[i];},
    useEffect:(effect:()=>void|(()=>void),deps:unknown[])=>{const i=hooks.index++,previous=hooks.slots[i] as unknown[]|undefined;if(previous?.length===deps.length&&previous.every((value,at)=>Object.is(value,deps[at])))return;hooks.slots[i]=deps;hooks.effects.push(()=>{hooks.cleanups.get(i)?.();const cleanup=effect();if(cleanup)hooks.cleanups.set(i,cleanup);});},
  };
});
vi.mock('../business-sheet/display-fonts',()=>({prepareDisplayFonts:fonts.prepare}));

let Canvas:typeof CanvasComponent;
let props:Parameters<typeof CanvasComponent>[0],tree:React.ReactElement;
let create:ReturnType<typeof vi.fn>,instance:WorkbookRuntime;
const host={} as HTMLDivElement;
function nodes(node:React.ReactNode):React.ReactElement<Record<string,unknown>>[]{
  if(!React.isValidElement<Record<string,unknown>>(node))return[];
  return[node,...React.Children.toArray(node.props.children as React.ReactNode).flatMap(nodes)];
}
function draw(){
  hooks.index=0;tree=Canvas(props);
  const container=nodes(tree).find(node=>node.props['data-testid']==='free-workbook')!;
  (container.props.ref as {current:HTMLDivElement|null}).current=host;
  hooks.effects.splice(0).forEach(effect=>effect());
  return renderToStaticMarkup(tree);
}
async function settle(){await vi.dynamicImportSettled();for(let i=0;i<8;i++)await Promise.resolve();return draw();}
function stop(){hooks.cleanups.forEach(cleanup=>cleanup());hooks.cleanups.clear();}
function retryButton(){return nodes(tree).find(node=>node.type==='button'&&node.props.children==='重试加载编辑器');}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}

beforeEach(async()=>{
  vi.resetModules();hooks.slots=[];hooks.index=0;hooks.effects=[];hooks.cleanups=new Map();
  fonts.prepare.mockReset().mockResolvedValue(undefined);
  instance={
    ready:Promise.resolve(),dispose:vi.fn(),restoreEdit:vi.fn().mockResolvedValue(undefined),
    retryImages:vi.fn(),snapshot:vi.fn(),draftSnapshot:vi.fn(),insertImage:vi.fn(),insertAsset:vi.fn(),setBackgroundAsset:vi.fn(),
  };
  create=vi.fn(()=>instance);vi.doMock('./runtime',()=>({createFreeWorkbook:create}));
  Canvas=(await import('./canvas')).WorkbookCanvas;
  props={
    snapshot:{id:'11111111-1111-4111-8111-111111111111',name:'合成加载恢复',appVersion:'1.0.4',locale:'zhCN',styles:{},sheetOrder:['s1'],sheets:{s1:{id:'s1',name:'工作表1',rowCount:20,columnCount:10,cellData:{0:{0:{v:'原内容'}}}}}} as Parameters<typeof CanvasComponent>[0]['snapshot'],
    runtime:{current:null},onReady:vi.fn(),onChanged:vi.fn(),onError:vi.fn(),onRecoveryError:vi.fn(),onUploading:vi.fn(),onImageFailures:vi.fn(),
  };
});
afterEach(()=>{stop();vi.doUnmock('./runtime');});

it('shows loading until the engine is ready without exposing a premature retry',async()=>{
  const pending=deferred<void>();instance.ready=pending.promise;
  expect(draw()).toContain('正在加载工作簿编辑器');await settle();
  expect(retryButton()).toBeUndefined();expect(props.onReady).not.toHaveBeenCalled();
  pending.resolve();expect(await settle()).not.toContain('正在加载工作簿编辑器');
  expect(props.onReady).toHaveBeenCalledTimes(1);expect(props.runtime.current).toBe(instance);
});

it('retries a rejected chunk only after the user clicks and retains the exact snapshot and edit',async()=>{
  vi.doMock('./runtime',()=>{throw new Error('Synthetic chunk load timeout');});
  const original=structuredClone(props.snapshot),edit={sheetId:'s1',row:0,column:0,document:{id:'synthetic-editor',documentStyle:{},body:{dataStream:'未确认原稿\r\n'}}};
  props.editingDraft=edit;
  draw();expect(await settle()).toContain('编辑器未能加载');expect(renderToStaticMarkup(tree)).toContain('重试加载编辑器');
  expect(create).not.toHaveBeenCalled();expect(props.runtime.current).toBeNull();expect(props.onError).not.toHaveBeenCalled();
  await settle();expect(create).not.toHaveBeenCalled();
  vi.doMock('./runtime',()=>({createFreeWorkbook:create}));
  const click=retryButton()!.props.onClick as ()=>void;click();click();draw();await settle();
  expect(create).toHaveBeenCalledTimes(1);expect(create.mock.calls[0]![0].snapshot).toBe(props.snapshot);
  expect(props.snapshot).toEqual(original);expect(instance.restoreEdit).toHaveBeenCalledWith(edit);expect(props.onReady).toHaveBeenCalledTimes(1);
  expect(retryButton()).toBeUndefined();expect(instance.insertImage).not.toHaveBeenCalled();expect(instance.insertAsset).not.toHaveBeenCalled();expect(instance.snapshot).not.toHaveBeenCalled();
});

it('does not create an engine when startup resolves after unmount',async()=>{
  const pending=deferred<void>();fonts.prepare.mockReturnValue(pending.promise);
  draw();await settle();expect(fonts.prepare).toHaveBeenCalledTimes(1);stop();
  pending.resolve();await settle();
  expect(create).not.toHaveBeenCalled();expect(props.runtime.current).toBeNull();expect(props.onReady).not.toHaveBeenCalled();expect(props.onError).not.toHaveBeenCalled();
});

it('disposes an unready instance and ignores its late readiness and callbacks',async()=>{
  const pending=deferred<void>();instance.ready=pending.promise;draw();await settle();
  const callbacks=create.mock.calls[0]![0];stop();pending.resolve();await settle();
  callbacks.onChanged();callbacks.onError('late');callbacks.onImageError('late image');callbacks.onUploading(1);callbacks.onImageFailures(1);
  expect(instance.dispose).toHaveBeenCalledTimes(1);expect(props.runtime.current).toBeNull();
  for(const callback of [props.onReady,props.onChanged,props.onError,props.onUploading,props.onImageFailures])expect(callback).not.toHaveBeenCalled();
  expect(await settle()).not.toContain('late image');expect(create).toHaveBeenCalledTimes(1);
});

it('does not turn recovery failure into a fresh engine retry or discard its draft',async()=>{
  props.editingDraft={sheetId:'s1',row:0,column:0,document:{id:'synthetic-editor',documentStyle:{},body:{dataStream:'原稿\r\n'}}};
  instance.restoreEdit=vi.fn().mockRejectedValue(new Error('Synthetic edit recovery failure'));
  draw();await settle();
  expect(props.onRecoveryError).toHaveBeenCalledWith('Synthetic edit recovery failure');
  expect(props.runtime.current).toBe(instance);expect(retryButton()).toBeUndefined();expect(props.onReady).not.toHaveBeenCalled();expect(instance.dispose).not.toHaveBeenCalled();
});

it('forwards an active engine error without replacing the editable instance',async()=>{
  draw();await settle();create.mock.calls[0]![0].onError('Synthetic command rejection');await settle();
  expect(props.onError).toHaveBeenCalledWith('Synthetic command rejection');expect(props.runtime.current).toBe(instance);
  expect(retryButton()).toBeUndefined();expect(create).toHaveBeenCalledTimes(1);expect(instance.dispose).not.toHaveBeenCalled();
});

it('clears only a previous image warning when a new upload starts, retaining unrelated errors',async()=>{
  draw();await settle();const callbacks=create.mock.calls[0]![0];
  callbacks.onUploading(1);callbacks.onImageError('图片上传连接中断；请重试核实原请求。');callbacks.onUploading(0);
  expect(await settle()).toContain('图片上传连接中断');expect(props.onError).not.toHaveBeenCalled();
  callbacks.onError('保存版本冲突，原稿保留。');callbacks.onUploading(1);
  expect(await settle()).not.toContain('图片上传连接中断');expect(props.onError).toHaveBeenCalledExactlyOnceWith('保存版本冲突，原稿保留。');
  callbacks.onImageError('图片上传期间工作表、选区或内容已变化。');callbacks.onUploading(0);
  expect(await settle()).toContain('图片上传期间工作表');
  callbacks.onUploading(1);callbacks.onUploading(0);
  expect(await settle()).not.toContain('图片上传期间工作表');expect(props.onError).toHaveBeenCalledTimes(1);
});
