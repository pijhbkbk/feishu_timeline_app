'use client';
import React, { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../lib/auth-client';
import { RecordForm } from '../business-sheet/record-form';
import type { ProductionFact } from './production-adapter';

export interface ProductionBasis {
  month: string; mode: 'MONTH_TOTAL' | 'MODEL_DETAILS' | null; revision: number; snapshotHash: string;
  totalFactId: string | null; totalQuantity: string | null; modelCount: number; modelKnownQuantity: string | null; modelUnknownCount: number;
  quantity: string | null; reconciliationRequired: boolean;
}
/** Identity and snapshot stay fixed while RecordForm retains an uncertain request. */
export function ProductionBasisDialog({ fact, onClose, onSaved }: { fact: ProductionFact; onClose(): void; onSaved(): void }) {
  const [data, setData] = useState<ProductionBasis | null>(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ colorId: fact.colorId, baseId: fact.baseId, month: fact.month });
    void apiRequest<ProductionBasis>(`/production-facts/basis?${query}`, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setData(value); }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '口径读取失败。'); });
    return () => controller.abort();
  }, [fact.colorId, fact.baseId, fact.month, attempt]);
  useEffect(() => { if (!data) dialog.current?.showModal(); }, [data]);
  if (!data) return <dialog ref={dialog} className="m1-modal cr-dialog" onCancel={onClose}><h2>核对月度统计口径</h2><p role={error ? 'alert' : 'status'}>{error || '读取完整月份…'}</p>{error ? <button onClick={() => { setError(''); setAttempt(value => value + 1); }}>重试读取</button> : null}<button onClick={onClose}>返回</button></dialog>;
  const options = [
    ...(data.totalFactId ? [{ value: 'MONTH_TOTAL', label: `原月度总量：${data.totalQuantity ?? '未知'} 台（车型明细只保留对账）` }] : []),
    ...(data.modelCount ? [{ value: 'MODEL_DETAILS', label: `${data.modelCount} 个车型：已知 ${data.modelKnownQuantity ?? '未知'} 台，${data.modelUnknownCount} 项未知（原总量只保留对账）` }] : []),
  ];
  return <RecordForm title={`${fact.month} · ${fact.baseName} · ${fact.colorName ?? fact.colorCode}：唯一统计口径`}
    fields={[{ key: 'mode', label: '核对原事实后选择，不会删除或分配原数量', required: true, initial: data.mode ?? '', options }]}
    submit={async (values, operationId) => {
      await apiRequest('/production-facts/basis', { method: 'PATCH', body: { operationId, colorId: fact.colorId, baseId: fact.baseId, month: fact.month,
        mode: values.mode, expectedRevision: data.revision, expectedSnapshot: data.snapshotHash } });
      onSaved();
    }} onClose={onClose} />;
}
