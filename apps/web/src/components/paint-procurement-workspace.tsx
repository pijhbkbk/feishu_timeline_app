'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from './auth-provider';
import {
  canManagePaintProcurement,
  canShowCompleteProcurementTaskButton,
  cancelPaintProcurement,
  completePaintProcurementTask,
  createPaintProcurement,
  createSupplier,
  fetchPaintProcurementWorkspace,
  getProcurementStatusLabel,
  getProcurementWorkspaceHighlights,
  markArrivedPaintProcurement,
  orderPaintProcurement,
  updatePaintProcurement,
  updateSupplier,
  validateProcurementForm,
  validateSupplierForm,
  type PaintProcurementFormInput,
  type PaintProcurementRecord,
  type PaintProcurementWorkspaceResponse,
  type SupplierFormInput,
  type SupplierSummary,
} from '../lib/paint-procurements-client';
import { formatDate } from '../lib/projects-client';
import {
  getWorkflowTaskStatusLabel,
  isWorkflowTaskOverdue,
} from '../lib/workflows-client';

type PaintProcurementWorkspaceProps = {
  projectId: string;
};

type ProcurementRecordFormProps = {
  suppliers: SupplierSummary[];
  value: PaintProcurementFormInput;
  onChange: (nextValue: PaintProcurementFormInput) => void;
  onSubmit: () => void;
  onReset: () => void;
  disabled: boolean;
  submitLabel: string;
  readOnly: boolean;
};

type SupplierInfoCardProps = {
  supplier: SupplierSummary;
  onEdit?: (supplier: SupplierSummary) => void;
  canManage: boolean;
};

type ProcurementRecordListProps = {
  items: PaintProcurementRecord[];
  canManage: boolean;
  isReadOnly: boolean;
  actingKey: string | null;
  onEdit?: (item: PaintProcurementRecord) => void;
  onOrder?: (item: PaintProcurementRecord) => void;
  onMarkArrived?: (item: PaintProcurementRecord) => void;
  onCancel?: (item: PaintProcurementRecord) => void;
};

const EMPTY_SUPPLIER_FORM: SupplierFormInput = {
  supplierCode: '',
  supplierName: '',
  contactName: '',
  contactPhone: '',
  status: 'ACTIVE',
};

const EMPTY_PROCUREMENT_FORM: PaintProcurementFormInput = {
  supplierId: '',
  procurementCode: '',
  materialName: '',
  batchNo: '',
  quantity: '',
  unit: '',
  arrivalDate: '',
  note: '',
};

export function PaintProcurementWorkspace({
  projectId,
}: PaintProcurementWorkspaceProps) {
  const { user } = useAuth();
  const requestIdRef = useRef(0);
  const [workspace, setWorkspace] = useState<PaintProcurementWorkspaceResponse | null>(null);
  const [supplierForm, setSupplierForm] = useState<SupplierFormInput>(EMPTY_SUPPLIER_FORM);
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [procurementForm, setProcurementForm] =
    useState<PaintProcurementFormInput>(EMPTY_PROCUREMENT_FORM);
  const [editingProcurementId, setEditingProcurementId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);
  const [isSavingProcurement, setIsSavingProcurement] = useState(false);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadWorkspace({ initial: true });
  }, [projectId]);

  const canManage = canManagePaintProcurement(user);
  const isReadOnly = !workspace?.activeTask;
  const highlights = workspace ? getProcurementWorkspaceHighlights(workspace) : null;

  const sortedSuppliers = useMemo(
    () => workspace?.suppliers ?? [],
    [workspace],
  );

  async function loadWorkspace(options?: { initial?: boolean }) {
    const requestId = ++requestIdRef.current;

    if (options?.initial) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    setError(null);

    try {
      const response = await fetchPaintProcurementWorkspace(projectId);

      if (requestId !== requestIdRef.current) {
        return;
      }

      setWorkspace(response);
      setProcurementForm((current) => ({
        ...current,
        supplierId:
          current.supplierId && response.suppliers.some((item) => item.id === current.supplierId)
            ? current.supplierId
            : (response.suppliers[0]?.id ?? ''),
      }));
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : '采购工作区加载失败。');
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  async function handleSaveSupplier() {
    const validationMessage = validateSupplierForm(supplierForm);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setIsSavingSupplier(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (editingSupplierId) {
        await updateSupplier(editingSupplierId, supplierForm);
        setSuccessMessage('供应商信息已更新。');
      } else {
        await createSupplier(supplierForm);
        setSuccessMessage('供应商已创建。');
      }

      setSupplierForm(EMPTY_SUPPLIER_FORM);
      setEditingSupplierId(null);
      await loadWorkspace();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '供应商保存失败。');
    } finally {
      setIsSavingSupplier(false);
    }
  }

  async function handleSaveProcurement() {
    const validationMessage = validateProcurementForm(procurementForm);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setIsSavingProcurement(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace = editingProcurementId
        ? await updatePaintProcurement(projectId, editingProcurementId, procurementForm)
        : await createPaintProcurement(projectId, procurementForm);
      setWorkspace(nextWorkspace);
      setEditingProcurementId(null);
      setProcurementForm({
        ...EMPTY_PROCUREMENT_FORM,
        supplierId: nextWorkspace.suppliers[0]?.id ?? '',
      });
      setSuccessMessage(editingProcurementId ? '采购记录已更新。' : '采购记录已创建。');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '采购记录保存失败。');
    } finally {
      setIsSavingProcurement(false);
    }
  }

  async function handleProcurementAction(
    action:
      | 'ORDER'
      | 'MARK_ARRIVED'
      | 'CANCEL'
      | 'COMPLETE_TASK',
    procurementId?: string,
  ) {
    const key = procurementId ? `${action}:${procurementId}` : action;
    setActingKey(key);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace =
        action === 'ORDER' && procurementId
          ? await orderPaintProcurement(projectId, procurementId)
          : action === 'MARK_ARRIVED' && procurementId
            ? await markArrivedPaintProcurement(projectId, procurementId)
            : action === 'CANCEL' && procurementId
              ? await cancelPaintProcurement(projectId, procurementId)
              : await completePaintProcurementTask(projectId);

      setWorkspace(nextWorkspace);
      setSuccessMessage(
        action === 'ORDER'
          ? '采购记录已下单。'
          : action === 'MARK_ARRIVED'
            ? '采购记录已标记到货。'
            : action === 'CANCEL'
              ? '采购记录已取消。'
              : '涂料采购节点已完成，并行节点已激活。',
      );
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '采购动作执行失败。');
    } finally {
      setActingKey(null);
    }
  }

  function prepareSupplierEdit(supplier: SupplierSummary) {
    setEditingSupplierId(supplier.id);
    setSupplierForm({
      supplierCode: supplier.supplierCode,
      supplierName: supplier.supplierName,
      contactName: supplier.contactName ?? '',
      contactPhone: supplier.contactPhone ?? '',
      status: supplier.status,
    });
  }

  function prepareProcurementEdit(item: PaintProcurementRecord) {
    setEditingProcurementId(item.id);
    setProcurementForm({
      supplierId: item.supplierId ?? '',
      procurementCode: item.procurementCode,
      materialName: item.materialName ?? '',
      batchNo: item.batchNo ?? '',
      quantity: item.quantity ?? '',
      unit: item.unit ?? '',
      arrivalDate: toDateInputValue(item.arrivalDate),
      note: item.note ?? '',
    });
  }

  function resetSupplierForm() {
    setEditingSupplierId(null);
    setSupplierForm(EMPTY_SUPPLIER_FORM);
  }

  function resetProcurementForm() {
    setEditingProcurementId(null);
    setProcurementForm({
      ...EMPTY_PROCUREMENT_FORM,
      supplierId: workspace?.suppliers[0]?.id ?? '',
    });
  }

  if (isLoading || !workspace || !highlights) {
    return (
      <section className="page-card">
        <p className="eyebrow">Paint Procurement</p>
        <h1>正在加载涂料采购模块…</h1>
        <p>采购记录、供应商和流程联动状态正在同步。</p>
      </section>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Paint Procurement</p>
            <h2 className="section-title">{workspace.project.name}</h2>
            <p className="muted">
              当前节点 {highlights.currentNodeLabel}，目标日期 {highlights.targetDateLabel}，
              风险等级 {highlights.riskLevelLabel}。
            </p>
          </div>
          <div className="inline-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={isRefreshing}
              onClick={() => void loadWorkspace()}
            >
              {isRefreshing ? '刷新中…' : '刷新'}
            </button>
            <Link href={`/projects/${projectId}/workflow`} className="button button-secondary">
              查看流程
            </Link>
          </div>
        </div>

        <div className="metadata-grid">
          <div className="metadata-item">
            <span>采购任务状态</span>
            <strong>{highlights.activeTaskStatusLabel}</strong>
          </div>
          <div className="metadata-item">
            <span>节点负责人</span>
            <strong>{workspace.activeTask?.assigneeUserName ?? '未分配'}</strong>
          </div>
          <div className="metadata-item">
            <span>有效到货记录</span>
            <strong>{workspace.statistics.arrivedCount}</strong>
          </div>
          <div className="metadata-item">
            <span>记录总数</span>
            <strong>{workspace.statistics.totalCount}</strong>
          </div>
        </div>

        {workspace.activeTask && isWorkflowTaskOverdue(workspace.activeTask) ? (
          <p className="error-text">当前涂料采购任务已超期。</p>
        ) : null}
        {isReadOnly ? (
          <p className="muted">
            当前没有活跃的 PAINT_PROCUREMENT 任务，页面处于只读状态。
          </p>
        ) : null}
      </section>

      {error ? <p className="error-text">{error}</p> : null}
      {successMessage ? <p className="success-text">{successMessage}</p> : null}

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Task Completion</p>
            <h2 className="section-title">采购节点完成条件</h2>
            <p className="muted">
              至少一条有效采购记录达到 ARRIVED 后，才允许完成当前采购节点。
            </p>
          </div>
        </div>
        <div className="summary-grid">
          <div className="summary-card">
            <span>首台生产计划</span>
            <strong>
              {workspace.downstreamTasks.firstProductionPlan
                ? getWorkflowTaskStatusLabel(workspace.downstreamTasks.firstProductionPlan.status)
                : '未激活'}
            </strong>
          </div>
          <div className="summary-card">
            <span>性能试验</span>
            <strong>
              {workspace.downstreamTasks.performanceTest
                ? getWorkflowTaskStatusLabel(workspace.downstreamTasks.performanceTest.status)
                : '未激活'}
            </strong>
          </div>
          <div className="summary-card">
            <span>标准板制作、下发</span>
            <strong>
              {workspace.downstreamTasks.standardBoardCreateDistribute
                ? getWorkflowTaskStatusLabel(
                    workspace.downstreamTasks.standardBoardCreateDistribute.status,
                  )
                : '未激活'}
            </strong>
          </div>
        </div>
        {workspace.completionIssue ? (
          <p className="muted">{workspace.completionIssue}</p>
        ) : null}
        <CompleteProcurementTaskButton
          disabled={
            !canShowCompleteProcurementTaskButton(user, workspace) ||
            actingKey === 'COMPLETE_TASK'
          }
          onClick={() => void handleProcurementAction('COMPLETE_TASK')}
        />
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Suppliers</p>
            <h2 className="section-title">供应商基础管理</h2>
            <p className="muted">支持新增和更新供应商基础信息，采购页面实时可选。</p>
          </div>
          <div className="inline-actions">
            <button type="button" className="button button-secondary" onClick={resetSupplierForm}>
              重置供应商表单
            </button>
          </div>
        </div>

        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSaveSupplier();
          }}
        >
          <label className="field">
            <span>供应商编码</span>
            <input
              required
              value={supplierForm.supplierCode}
              onChange={(event) =>
                setSupplierForm((current) => ({
                  ...current,
                  supplierCode: event.target.value,
                }))
              }
            />
          </label>
          <label className="field">
            <span>供应商名称</span>
            <input
              required
              value={supplierForm.supplierName}
              onChange={(event) =>
                setSupplierForm((current) => ({
                  ...current,
                  supplierName: event.target.value,
                }))
              }
            />
          </label>
          <label className="field">
            <span>联系人</span>
            <input
              value={supplierForm.contactName}
              onChange={(event) =>
                setSupplierForm((current) => ({
                  ...current,
                  contactName: event.target.value,
                }))
              }
            />
          </label>
          <label className="field">
            <span>联系电话</span>
            <input
              value={supplierForm.contactPhone}
              onChange={(event) =>
                setSupplierForm((current) => ({
                  ...current,
                  contactPhone: event.target.value,
                }))
              }
            />
          </label>
          <label className="field">
            <span>状态</span>
            <select
              value={supplierForm.status}
              onChange={(event) =>
                setSupplierForm((current) => ({
                  ...current,
                  status: event.target.value as SupplierFormInput['status'],
                }))
              }
            >
              <option value="ACTIVE">启用</option>
              <option value="INACTIVE">停用</option>
            </select>
          </label>
          <div className="field field-actions">
            <button
              type="submit"
              className="button"
              disabled={!canManage || isSavingSupplier}
            >
              {isSavingSupplier
                ? '保存中…'
                : editingSupplierId
                  ? '更新供应商'
                  : '新增供应商'}
            </button>
          </div>
        </form>

        <div className="detail-grid">
          {sortedSuppliers.length === 0 ? (
            <div className="empty-state">
              <strong>暂无供应商</strong>
              <p>先创建供应商，再录入采购记录。</p>
            </div>
          ) : (
            sortedSuppliers.map((supplier) => (
              <SupplierInfoCard
                key={supplier.id}
                supplier={supplier}
                canManage={canManage}
                onEdit={prepareSupplierEdit}
              />
            ))
          )}
        </div>
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Procurement Records</p>
            <h2 className="section-title">采购记录与批次信息</h2>
            <p className="muted">采购记录状态由标准动作控制，无活跃采购任务时页面只读。</p>
          </div>
          <div className="inline-actions">
            <button type="button" className="button button-secondary" onClick={resetProcurementForm}>
              重置采购表单
            </button>
          </div>
        </div>

        <ProcurementRecordForm
          suppliers={sortedSuppliers}
          value={procurementForm}
          onChange={setProcurementForm}
          onSubmit={() => void handleSaveProcurement()}
          onReset={resetProcurementForm}
          disabled={isSavingProcurement || !canManage}
          submitLabel={editingProcurementId ? '更新采购记录' : '新建采购记录'}
          readOnly={isReadOnly}
        />

        <ProcurementRecordList
          items={workspace.items}
          canManage={canManage}
          isReadOnly={isReadOnly}
          actingKey={actingKey}
          onEdit={prepareProcurementEdit}
          onOrder={(item) => void handleProcurementAction('ORDER', item.id)}
          onMarkArrived={(item) => void handleProcurementAction('MARK_ARRIVED', item.id)}
          onCancel={(item) => void handleProcurementAction('CANCEL', item.id)}
        />
      </section>
    </div>
  );
}

export function ProcurementRecordForm({
  suppliers,
  value,
  onChange,
  onSubmit,
  onReset,
  disabled,
  submitLabel,
  readOnly,
}: ProcurementRecordFormProps) {
  return (
    <form
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="field">
        <span>采购单号</span>
        <input
          required
          value={value.procurementCode}
          disabled={disabled || readOnly}
          onChange={(event) =>
            onChange({
              ...value,
              procurementCode: event.target.value,
            })
          }
        />
      </label>
      <label className="field">
        <span>供应商</span>
        <select
          required
          value={value.supplierId}
          disabled={disabled || readOnly}
          onChange={(event) =>
            onChange({
              ...value,
              supplierId: event.target.value,
            })
          }
        >
          <option value="">请选择供应商</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.supplierName}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>物料名称</span>
        <input
          required
          value={value.materialName}
          disabled={disabled || readOnly}
          onChange={(event) =>
            onChange({
              ...value,
              materialName: event.target.value,
            })
          }
        />
      </label>
      <label className="field">
        <span>批次号</span>
        <input
          required
          value={value.batchNo}
          disabled={disabled || readOnly}
          onChange={(event) =>
            onChange({
              ...value,
              batchNo: event.target.value,
            })
          }
        />
      </label>
      <label className="field">
        <span>数量</span>
        <input
          required
          inputMode="decimal"
          value={value.quantity}
          disabled={disabled || readOnly}
          onChange={(event) =>
            onChange({
              ...value,
              quantity: event.target.value,
            })
          }
        />
      </label>
      <label className="field">
        <span>单位</span>
        <input
          required
          value={value.unit}
          disabled={disabled || readOnly}
          onChange={(event) =>
            onChange({
              ...value,
              unit: event.target.value,
            })
          }
        />
      </label>
      <label className="field">
        <span>到货日期</span>
        <input
          required
          type="date"
          value={value.arrivalDate}
          disabled={disabled || readOnly}
          onChange={(event) =>
            onChange({
              ...value,
              arrivalDate: event.target.value,
            })
          }
        />
      </label>
      <label className="field">
        <span>采购状态</span>
        <input value="通过动作按钮流转" disabled />
      </label>
      <label className="field field-full">
        <span>备注</span>
        <textarea
          rows={4}
          value={value.note}
          disabled={disabled || readOnly}
          onChange={(event) =>
            onChange({
              ...value,
              note: event.target.value,
            })
          }
        />
      </label>
      <div className="field field-actions">
        <div className="inline-actions">
          <button type="submit" className="button" disabled={disabled || readOnly}>
            {submitLabel}
          </button>
          <button type="button" className="button button-secondary" onClick={onReset}>
            重置
          </button>
        </div>
      </div>
    </form>
  );
}

export function ProcurementRecordList({
  items,
  canManage,
  isReadOnly,
  actingKey,
  onEdit,
  onOrder,
  onMarkArrived,
  onCancel,
}: ProcurementRecordListProps) {
  return (
    <div className="table-shell">
      <table className="data-table">
        <thead>
          <tr>
            <th>采购单号</th>
            <th>供应商</th>
            <th>物料名称</th>
            <th>批次号</th>
            <th>数量</th>
            <th>到货日期</th>
            <th>状态</th>
            <th>动作</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={8}>
                <div className="empty-state">
                  <strong>暂无采购记录</strong>
                  <p>样板确认通过后，可在这里创建并维护涂料采购记录。</p>
                </div>
              </td>
            </tr>
          ) : (
            items.map((item) => {
              const canEdit = canManage && !isReadOnly && ['DRAFT', 'ORDERED'].includes(item.status);

              return (
                <tr key={item.id}>
                  <td>
                    <div className="cell-stack">
                      <strong>{item.procurementCode}</strong>
                      <span>{formatDate(item.updatedAt)}</span>
                    </div>
                  </td>
                  <td>
                    <div className="cell-stack">
                      <strong>{item.supplier?.supplierName ?? '未绑定供应商'}</strong>
                      <span>{item.supplier?.contactPhone ?? '无联系方式'}</span>
                    </div>
                  </td>
                  <td>{item.materialName ?? '未填写'}</td>
                  <td>{item.batchNo ?? '未填写'}</td>
                  <td>
                    {item.quantity ?? '--'} {item.unit ?? ''}
                  </td>
                  <td>{formatDate(item.arrivalDate)}</td>
                  <td>
                    <ProcurementStatusBadge status={item.status} />
                  </td>
                  <td>
                    <div className="task-actions">
                      {canEdit && onEdit ? (
                        <button
                          type="button"
                          className="button button-secondary button-small"
                          onClick={() => onEdit(item)}
                        >
                          编辑
                        </button>
                      ) : null}
                      {canManage && !isReadOnly && item.status === 'DRAFT' && onOrder ? (
                        <button
                          type="button"
                          className="button button-secondary button-small"
                          disabled={actingKey === `ORDER:${item.id}`}
                          onClick={() => onOrder(item)}
                        >
                          {actingKey === `ORDER:${item.id}` ? '处理中…' : '标记下单'}
                        </button>
                      ) : null}
                      {canManage && !isReadOnly && item.status === 'ORDERED' && onMarkArrived ? (
                        <MarkArrivedButton
                          disabled={actingKey === `MARK_ARRIVED:${item.id}`}
                          onClick={() => onMarkArrived(item)}
                        />
                      ) : null}
                      {canManage &&
                      !isReadOnly &&
                      (item.status === 'DRAFT' || item.status === 'ORDERED') &&
                      onCancel ? (
                        <button
                          type="button"
                          className="button button-secondary button-small"
                          disabled={actingKey === `CANCEL:${item.id}`}
                          onClick={() => onCancel(item)}
                        >
                          {actingKey === `CANCEL:${item.id}` ? '处理中…' : '取消'}
                        </button>
                      ) : null}
                      {(!canManage || isReadOnly) ? (
                        <span className="muted">只读</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export function ProcurementStatusBadge({
  status,
}: {
  status: PaintProcurementRecord['status'];
}) {
  const className =
    status === 'ARRIVED'
      ? 'status-pill status-pill-success'
      : status === 'ORDERED'
        ? 'status-pill status-pill-warning'
        : status === 'CANCELLED'
          ? 'status-pill status-pill-danger'
          : 'status-pill status-pill-neutral';

  return <span className={className}>{getProcurementStatusLabel(status)}</span>;
}

export function SupplierInfoCard({
  supplier,
  onEdit,
  canManage,
}: SupplierInfoCardProps) {
  return (
    <article className="detail-item">
      <span>{supplier.supplierCode}</span>
      <strong>{supplier.supplierName}</strong>
      <strong>{supplier.contactName ?? '未填写联系人'}</strong>
      <strong>{supplier.contactPhone ?? '未填写联系电话'}</strong>
      <span
        className={`status-pill ${
          supplier.status === 'ACTIVE' ? 'status-pill-success' : 'status-pill-neutral'
        }`}
      >
        {supplier.status === 'ACTIVE' ? '启用' : '停用'}
      </span>
      {canManage && onEdit ? (
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={() => onEdit(supplier)}
        >
          编辑供应商
        </button>
      ) : null}
    </article>
  );
}

export function MarkArrivedButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      className="button button-secondary button-small"
      disabled={disabled}
      onClick={onClick}
    >
      {disabled ? '处理中…' : '标记到货'}
    </button>
  );
}

export function CompleteProcurementTaskButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button type="button" className="button" disabled={disabled} onClick={onClick}>
      完成采购节点
    </button>
  );
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  return new Date(value).toISOString().slice(0, 10);
}
