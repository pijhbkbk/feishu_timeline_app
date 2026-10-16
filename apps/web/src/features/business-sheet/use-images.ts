'use client';
import { ApiRequestError } from '../../lib/auth-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteSheetImage, defaultImageLayout, listSheetImages, updateImageLayout, uploadSheetImage, type ImageLayout, type SheetImage, type SheetImageTarget } from './image-client';
type Job = { key: string; operationId: string; recordId: string; status: 'waiting' | 'uploading' | 'failed'; progress: number; error?: string; rejectedStatus?: number; replaceId?: string } & ({ kind: 'upload'; file: File; layout: ImageLayout } | { kind: 'layout'; imageId: string; layout: ImageLayout; snapshot?: SheetImage } | { kind: 'delete'; imageId: string; snapshot?: SheetImage });
export function useSheetImages(targetType: SheetImageTarget, recordIds: readonly string[]) {
  const [images, setImages] = useState<SheetImage[]>([]), [jobs, setJobs] = useState<Job[]>([]), [error, setError] = useState('');
  const currentImages = useRef<SheetImage[]>([]), queue = useRef<Job[]>([]), active = useRef(false), mounted = useRef(true);
  const signature = recordIds.join(',');
  const readSequence = useRef(0), mutationVersion = useRef(0), reloadLatest = useRef<(signal?: AbortSignal) => Promise<void>>(async () => {});
  const bump = () => { if (mounted.current) setJobs([...queue.current]); };
  const confirm = (image: SheetImage) => {
    mutationVersion.current++;
    currentImages.current = currentImages.current.filter(value => value.id !== image.id);
    if (!image.isDeleted) currentImages.current.push(image);
    if (mounted.current) setImages([...currentImages.current]);
  };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const reload = useCallback(async (signal?: AbortSignal) => {
    const sequence = ++readSequence.current, version = mutationVersion.current;
    try { const result = await listSheetImages(targetType, signature ? signature.split(',') : [], signal); if (!signal?.aborted && mounted.current && sequence === readSequence.current) { if (version !== mutationVersion.current) { void reloadLatest.current(); return; } currentImages.current = result; setImages(result); setError(''); } }
    catch (cause) { if (!signal?.aborted && mounted.current) setError(cause instanceof Error ? cause.message : '图片读取失败'); }
  }, [targetType, signature]);
  reloadLatest.current = reload;
  useEffect(() => { const controller = new AbortController(); void reload(controller.signal); return () => controller.abort(); }, [reload]);
  async function pump() {
    if (active.current) return; active.current = true;
    try {
      while (mounted.current) {
        const job = queue.current.find((value, index) => value.status === 'waiting' && (value.kind === 'upload' || !queue.current.slice(0, index).some(prior => prior.kind !== 'upload' && prior.imageId === value.imageId)));  if (!job) break;
        job.status = 'uploading'; bump();
        try {
          let saved: SheetImage;
          if (job.kind === 'upload') saved = await uploadSheetImage(job.file, targetType, job.recordId, job.layout, job.operationId, progress => { job.progress = progress; bump(); });
          else {
            const latest = currentImages.current.find(value => value.id === job.imageId);
            if (!latest && !job.snapshot) throw new Error('图片已被删除或不可访问，请重新读取后核对。');
            job.snapshot ??= latest!;
            saved = job.kind === 'layout' ? await updateImageLayout(job.snapshot, job.layout, job.operationId) : await deleteSheetImage(job.snapshot, job.operationId);
          }
          confirm(saved); queue.current = queue.current.filter(value => value.key !== job.key);
          if (job.replaceId) queue.current.push({ kind: 'delete', key: crypto.randomUUID(), operationId: crypto.randomUUID(), imageId: job.replaceId, recordId: job.recordId, status: 'waiting', progress: 0 });
        } catch (cause) { job.status = 'failed'; job.error = cause instanceof Error ? cause.message : '图片保存失败'; if (cause instanceof ApiRequestError) job.rejectedStatus = cause.status; }
        bump();
      }
    } finally { active.current = false; }
  }
  async function add(files: readonly File[], recordId: string, layout = defaultImageLayout(), replaceId?: string) {
    if (!signature.split(',').includes(recordId)) throw new Error('请先选择已保存的记录，再添加图片。');
    if (!files.length || files.length > 50 || files.some(file => !['image/png', 'image/jpeg'].includes(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024)) throw new Error('每次最多 50 张，每张须为不超过 5 MiB 的 PNG/JPEG。');
    files.forEach((file, index) => queue.current.push({ kind: 'upload', key: crypto.randomUUID(), operationId: crypto.randomUUID(), recordId, file, layout: { ...layout, offsetX: layout.offsetX + index * 12 }, status: 'waiting', progress: 0, ...(replaceId ? { replaceId } : {}) }));
    bump(); await pump();
  }
  function change(image: SheetImage, layout: ImageLayout) {
    // Coalesce unsent drags only. A submitted request retains its exact payload for replay.
    const waiting = queue.current.find(job => job.kind === 'layout' && job.imageId === image.id && job.status === 'waiting');
    if (waiting?.kind === 'layout') waiting.layout = layout;
    else queue.current.push({ kind: 'layout', key: crypto.randomUUID(), operationId: crypto.randomUUID(), imageId: image.id, recordId: image.recordId, layout, status: 'waiting', progress: 0 });
    bump(); void pump();
  }
  function remove(image: SheetImage) { queue.current.push({ kind: 'delete', key: crypto.randomUUID(), operationId: crypto.randomUUID(), imageId: image.id, recordId: image.recordId, status: 'waiting', progress: 0 }); bump(); void pump(); }
  function retry() { queue.current.forEach(job => { if (job.status === 'failed') { job.status = 'waiting'; delete job.error; } }); bump(); void pump(); }
  function discardConflict(imageId: string) {
    const conflict = queue.current.find(job => job.kind !== 'upload' && job.imageId === imageId && job.status === 'failed' && job.rejectedStatus === 409);
    if (!conflict) return;
    queue.current = queue.current.filter(job => job.kind === 'upload' || job.imageId !== imageId); bump(); void reload(); void pump();
  }
  return { images, jobs, error, discardConflict, pending: jobs.length > 0, add, change, remove, retry, reload };
}
export type SheetImagesState = ReturnType<typeof useSheetImages>;
