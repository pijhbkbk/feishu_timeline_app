'use client';
import { useEffect, useRef, type MutableRefObject } from 'react';
import { prepareDisplayFonts } from './display-fonts';
import type { SheetImage } from './image-client';
import type { BusinessSheetOptions, BusinessSheetRuntime } from './runtime';

export interface BusinessSheetCanvasProps extends Omit<BusinessSheetOptions, 'container'> {
  images?: readonly SheetImage[];
  runtimeRef: MutableRefObject<BusinessSheetRuntime | null>;
  label: string;
  onReady: (ready: boolean) => void;
  selection: { id: string | null; field: string };
}

/** One engine per mounted module. Sorting/filtering only updates its projection. */
export function BusinessSheetCanvas(props: BusinessSheetCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef(props); current.current = props;
  const loadedRows = useRef(props.rows);
  const serial = useRef(Promise.resolve());
  const runtimeRef = props.runtimeRef;
  useEffect(() => {
    let stopped = false; let instance: BusinessSheetRuntime | null = null;
    current.current.onReady(false);
    void import('./runtime').then(async ({ createBusinessSheet }) => {
      await prepareDisplayFonts();
      if (stopped || !host.current) return;
      const value = current.current; loadedRows.current = value.rows;
      instance = createBusinessSheet({ container: host.current, rows: value.rows, columns: value.columns,
        onChanges: changes => current.current.onChanges(changes),
        ...(value.onBeforeChanges ? { onBeforeChanges: (changes: Parameters<NonNullable<BusinessSheetOptions['onBeforeChanges']>>[0]) => current.current.onBeforeChanges?.(changes) } : {}),
        onSelection: (...args) => current.current.onSelection(...args),
        onError: error => current.current.onError(error),
        onUndo: () => current.current.onUndo?.(), onRedo: () => current.current.onRedo?.(),
        imageActions: { add: (...args) => current.current.imageActions?.add(...args), change: (...args) => current.current.imageActions?.change(...args), remove: image => current.current.imageActions?.remove(image), requestFiles: () => current.current.imageActions?.requestFiles() },
      });
      runtimeRef.current = instance; await instance.ready;
      if (stopped) return;
      if (loadedRows.current !== current.current.rows) { await instance.replaceRows(current.current.rows); loadedRows.current = current.current.rows; }
      const selected = current.current.selection;
      if (selected.id) instance.selectCell(selected.id, selected.field);
      await instance.setImages(current.current.images ?? []);
      current.current.onReady(true);
    }).catch(cause => { if (!stopped) current.current.onError(cause instanceof Error ? cause.message : '表格未能加载'); });
    return () => { stopped = true; instance?.dispose(); if (runtimeRef.current === instance) runtimeRef.current = null; };
  }, [runtimeRef]);
  useEffect(() => {
    const instance = runtimeRef.current;
    if (!instance || loadedRows.current === props.rows) return;
    const rows = props.rows;
    serial.current = serial.current.then(async () => {
      if (runtimeRef.current !== instance || current.current.rows !== rows) return;
      await instance.replaceRows(rows); loadedRows.current = rows;
      const selected = current.current.selection;
      if (selected.id) instance.selectCell(selected.id, selected.field);
    }).catch(cause => current.current.onError(cause instanceof Error ? cause.message : '更新表格视图失败'));
  }, [props.rows, runtimeRef]);
  useEffect(() => { const instance = runtimeRef.current; if (instance) void instance.setImages(props.images ?? []).catch(cause => current.current.onError(cause instanceof Error ? cause.message : '图片视图加载失败')); }, [props.images, runtimeRef]);
  return <div ref={host} className="cs-engine" aria-label={props.label} data-testid="business-sheet" />;
}
