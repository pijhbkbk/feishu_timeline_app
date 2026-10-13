import type { ComponentType, MutableRefObject, ReactNode } from 'react';
import type { BusinessSheetRuntime, BusinessSheetRow } from './runtime';
import type { BusinessSheetCanvasProps } from './canvas';
export type RecordSheetValue = string | null;
export interface RecordSheetRow<TMeta = unknown> { id: string; revision: number; values: Record<string, RecordSheetValue>; editable: readonly string[]; meta?: TMeta }
export interface RecordSheetColumn { key: string; label: string; width: number }
export interface RecordSheetChange { id: string; field: string; value: RecordSheetValue }
export interface RecordSheetPatch { id: string; expectedRevision: number; changes: Record<string, RecordSheetValue> }
export interface RecordSheetIssue { id: string; field: string; message: string }
export interface RecordSheetConflict { id: string; missing: boolean; expectedRevision: number; currentRevision: number; fields: { field: string; server: RecordSheetValue; desired: RecordSheetValue }[] }
export type RecordSheetRuntime = BusinessSheetRuntime;
export type RecordCanvasRow = BusinessSheetRow;
export type RecordCanvasProps = BusinessSheetCanvasProps;
export type RecordSaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'invalid' | 'failed' | 'uncertain' | 'conflict';
export interface RecordWorkspaceContext<TMeta = unknown> {
  selected: RecordSheetRow<TMeta> | null; runtimeRef: MutableRefObject<RecordSheetRuntime | null>; status: RecordSaveState;
  dirtyCount: number; loading: boolean; refresh(): Promise<void>; retry(): Promise<void>; edit(changes: RecordSheetChange[]): void;
}
export interface RecordSheetWorkspaceProps<TMeta = unknown, TImages = unknown> {
  title: string; columns: readonly RecordSheetColumn[];
  /** Complete authorized view. If paged, adapter must show exact scope/total and
   * not treat a page refresh as deletion of a record outside this page. */
  load(signal: AbortSignal): Promise<RecordSheetRow<TMeta>[]>;
  save(items: RecordSheetPatch[], operationId: string): Promise<RecordSheetRow<TMeta>[]>;
  validate?(row: RecordSheetRow<TMeta>, field: string, value: RecordSheetValue): string | undefined;
  searchText?(row: RecordSheetRow<TMeta>): string;
  /** Inject existing shared BusinessSheetCanvas; no second Univer implementation. */
  Canvas: ComponentType<RecordCanvasProps>;
  runtimeRef?: MutableRefObject<RecordSheetRuntime | null>;
  onReady?(ready: boolean): void;
  onRowsLoaded?(rows: readonly RecordSheetRow<TMeta>[]): void;
  canvasProps?: Pick<RecordCanvasProps, 'images' | 'imageActions'>;
  onSelection?(row: RecordSheetRow<TMeta> | null): void;
  onImport?: ((context: RecordWorkspaceContext<TMeta>) => void | Promise<void>) | undefined;
  onExport?: ((rows: readonly RecordSheetRow<TMeta>[], context: RecordWorkspaceContext<TMeta>) => void | Promise<void>) | undefined;
  onCreate?: ((context: RecordWorkspaceContext<TMeta>) => void | Promise<void>) | undefined;
  slots?: Partial<Record<'header' | 'toolbar' | 'detail' | 'empty', (context: RecordWorkspaceContext<TMeta>) => ReactNode>>;
  /** Opaque attachment hooks pass only to caller's image panel; the generic
   * saver never interprets asset data, grants permissions, or persists bytes. */
  images?: TImages;
  renderImages?(images: TImages, context: RecordWorkspaceContext<TMeta>): ReactNode;
  autosaveMs?: number; // default 300; failure pauses automation until explicit retry
}
