'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from './auth-provider';
import {
  bindProjectAttachment,
  canManageProjectAttachments,
  deleteProjectAttachment,
  fetchAttachmentsWorkspace,
  formatAttachmentSize,
  formatAttachmentTime,
  getAttachmentDownloadUrl,
  getAttachmentEntityTypeLabel,
  getAttachmentPreviewKind,
  getAttachmentPreviewUrl,
  getEntityItemsForType,
  unbindProjectAttachment,
  uploadProjectAttachment,
  validateAttachmentBindInput,
  validateAttachmentUploadInput,
  type AttachmentEntityType,
  type AttachmentWorkspaceFilters,
  type AttachmentWorkspaceResponse,
  type ProjectAttachmentSummary,
} from '../lib/attachments-client';

type AttachmentsWorkspaceProps = {
  projectId: string;
  initialFilters?: AttachmentWorkspaceFilters;
};

type UploadFormState = {
  entityType: AttachmentEntityType | '';
  entityId: string;
  file: File | null;
};

type BindFormState = {
  entityType: AttachmentEntityType | '';
  entityId: string;
};

export function AttachmentsWorkspace({
  projectId,
  initialFilters,
}: AttachmentsWorkspaceProps) {
  const { user } = useAuth();
  const requestIdRef = useRef(0);
  const [workspace, setWorkspace] = useState<AttachmentWorkspaceResponse | null>(null);
  const [filters, setFilters] = useState<AttachmentWorkspaceFilters>({
    entityType: initialFilters?.entityType ?? '',
    entityId: initialFilters?.entityId ?? '',
    includeDeleted: initialFilters?.includeDeleted ?? false,
  });
  const [uploadForm, setUploadForm] = useState<UploadFormState>({
    entityType: initialFilters?.entityType ?? 'PROJECT',
    entityId: initialFilters?.entityId ?? projectId,
    file: null,
  });
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string | null>(null);
  const [bindForm, setBindForm] = useState<BindFormState>({
    entityType: initialFilters?.entityType ?? 'PROJECT',
    entityId: initialFilters?.entityId ?? projectId,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadWorkspace({ initial: true });
  }, [projectId]);

  useEffect(() => {
    if (!workspace?.items.length) {
      setSelectedAttachmentId(null);
      return;
    }

    const nextAttachmentId =
      selectedAttachmentId && workspace.items.some((item) => item.id === selectedAttachmentId)
        ? selectedAttachmentId
        : (workspace.items[0]?.id ?? null);

    if (nextAttachmentId !== selectedAttachmentId) {
      setSelectedAttachmentId(nextAttachmentId);
    }
  }, [selectedAttachmentId, workspace]);

  useEffect(() => {
    if (!workspace) {
      return;
    }

    const selectedAttachment =
      workspace.items.find((item) => item.id === selectedAttachmentId) ?? null;

    setBindForm({
      entityType: selectedAttachment?.entityType ?? 'PROJECT',
      entityId: selectedAttachment?.entityId ?? projectId,
    });
  }, [projectId, selectedAttachmentId, workspace]);

  const canManage = canManageProjectAttachments(user);
  const selectedAttachment =
    workspace?.items.find((item) => item.id === selectedAttachmentId) ?? null;
  const filterEntityItems = workspace
    ? getEntityItemsForType(workspace, filters.entityType ?? '')
    : [];
  const uploadEntityItems = workspace
    ? getEntityItemsForType(workspace, uploadForm.entityType)
    : [];
  const bindEntityItems = workspace
    ? getEntityItemsForType(workspace, bindForm.entityType)
    : [];

  const summaryCards = useMemo(
    () => [
      {
        label: '附件总数',
        value: String(workspace?.statistics.totalCount ?? 0),
      },
      {
        label: '活跃附件',
        value: String(workspace?.statistics.activeCount ?? 0),
      },
      {
        label: '已删除附件',
        value: String(workspace?.statistics.deletedCount ?? 0),
      },
      {
        label: '当前筛选',
        value: filters.entityType
          ? getAttachmentEntityTypeLabel(filters.entityType)
          : '全部实体',
      },
    ],
    [filters.entityType, workspace],
  );

  async function loadWorkspace(options?: {
    initial?: boolean;
    nextSelectedAttachmentId?: string | null;
    nextFilters?: AttachmentWorkspaceFilters;
  }) {
    const requestId = ++requestIdRef.current;
    const effectiveFilters = options?.nextFilters ?? filters;

    if (options?.initial) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    setError(null);

    try {
      const response = await fetchAttachmentsWorkspace(projectId, effectiveFilters);

      if (requestId !== requestIdRef.current) {
        return;
      }

      setWorkspace(response);

      if (options?.nextFilters) {
        setFilters(effectiveFilters);
      }

      if (options?.nextSelectedAttachmentId !== undefined) {
        setSelectedAttachmentId(options.nextSelectedAttachmentId);
      }

      setUploadForm((current) => ({
        ...current,
        entityId:
          current.entityType === 'PROJECT'
            ? projectId
            : current.entityId && getEntityItemsForType(response, current.entityType).some(
                (item) => item.id === current.entityId,
              )
              ? current.entityId
              : (getEntityItemsForType(response, current.entityType)[0]?.id ?? ''),
      }));
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : '附件中心加载失败。');
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  async function handleUpload() {
    const validationMessage = validateAttachmentUploadInput(uploadForm);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setIsUploading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const created = await uploadProjectAttachment(projectId, uploadForm.file!, {
        entityType: uploadForm.entityType as AttachmentEntityType,
        entityId: uploadForm.entityId,
      });

      await loadWorkspace({ nextSelectedAttachmentId: created.id });
      setUploadForm((current) => ({
        entityType: current.entityType,
        entityId: current.entityType === 'PROJECT' ? projectId : current.entityId,
        file: null,
      }));
      setSuccessMessage('附件已上传。');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '附件上传失败。');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleBind() {
    if (!selectedAttachment) {
      setError('请先选择一条附件记录。');
      return;
    }

    const validationMessage = validateAttachmentBindInput(bindForm);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setActingKey(`bind:${selectedAttachment.id}`);
    setError(null);
    setSuccessMessage(null);

    try {
      const updated = await bindProjectAttachment(projectId, selectedAttachment.id, {
        entityType: bindForm.entityType as AttachmentEntityType,
        entityId: bindForm.entityId,
      });
      await loadWorkspace({ nextSelectedAttachmentId: updated.id });
      setSuccessMessage('附件绑定已更新。');
    } catch (bindError) {
      setError(bindError instanceof Error ? bindError.message : '附件绑定失败。');
    } finally {
      setActingKey(null);
    }
  }

  async function handleUnbind() {
    if (!selectedAttachment) {
      setError('请先选择一条附件记录。');
      return;
    }

    setActingKey(`unbind:${selectedAttachment.id}`);
    setError(null);
    setSuccessMessage(null);

    try {
      const updated = await unbindProjectAttachment(projectId, selectedAttachment.id);
      await loadWorkspace({ nextSelectedAttachmentId: updated.id });
      setSuccessMessage('附件已解绑为项目级附件。');
    } catch (unbindError) {
      setError(unbindError instanceof Error ? unbindError.message : '附件解绑失败。');
    } finally {
      setActingKey(null);
    }
  }

  async function handleDelete(attachment: ProjectAttachmentSummary) {
    setActingKey(`delete:${attachment.id}`);
    setError(null);
    setSuccessMessage(null);

    try {
      await deleteProjectAttachment(projectId, attachment.id);
      await loadWorkspace({
        nextSelectedAttachmentId:
          selectedAttachmentId === attachment.id ? null : selectedAttachmentId,
      });
      setSuccessMessage('附件已逻辑删除。');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '附件删除失败。');
    } finally {
      setActingKey(null);
    }
  }

  if (isLoading || !workspace) {
    return (
      <section className="page-card">
        <p className="eyebrow">Attachments Center</p>
        <h1>正在加载附件中心…</h1>
        <p>项目附件、业务实体关联和预览信息正在同步。</p>
      </section>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Attachments Center</p>
            <h2 className="section-title">{workspace.project.name}</h2>
            <p className="muted">
              当前节点 {workspace.project.currentNodeName ?? '未开始'}，目标日期{' '}
              {formatAttachmentTime(workspace.project.targetDate)}。
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
            <Link href={`/projects/${projectId}/overview`} className="button button-secondary">
              返回概览
            </Link>
          </div>
        </div>
        <div className="summary-grid">
          {summaryCards.map((card) => (
            <div key={card.label} className="summary-card">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </div>
          ))}
        </div>
      </section>

      {error ? <p className="error-text">{error}</p> : null}
      {successMessage ? <p className="success-text">{successMessage}</p> : null}

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Filter</p>
            <h2 className="section-title">附件筛选</h2>
            <p className="muted">按业务实体筛选，必要时可查看逻辑删除记录。</p>
          </div>
        </div>
        <AttachmentFilterBar
          workspace={workspace}
          value={filters}
          entityItems={filterEntityItems}
          onChange={setFilters}
          onApply={() => void loadWorkspace({ nextFilters: filters })}
        />
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Upload</p>
            <h2 className="section-title">上传项目附件</h2>
            <p className="muted">
              开发环境走本地对象存储适配层，数据库仅保存元数据和业务实体关联。
            </p>
          </div>
        </div>
        <AttachmentUploader
          workspace={workspace}
          value={uploadForm}
          entityItems={uploadEntityItems}
          disabled={!canManage || isUploading}
          onChange={setUploadForm}
          onUpload={() => void handleUpload()}
        />
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Attachment List</p>
            <h2 className="section-title">项目附件列表</h2>
            <p className="muted">支持预览图片和 PDF，其他类型可直接下载。</p>
          </div>
        </div>
        <AttachmentList
          items={workspace.items}
          selectedAttachmentId={selectedAttachmentId}
          canManage={canManage}
          actingKey={actingKey}
          onSelect={setSelectedAttachmentId}
          onDelete={(attachment) => void handleDelete(attachment)}
        />
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Preview</p>
            <h2 className="section-title">附件预览与绑定</h2>
            <p className="muted">图片和 PDF 支持预览，其他文件可下载；同时支持重新绑定业务实体。</p>
          </div>
        </div>
        <AttachmentPreviewPanel
          projectId={projectId}
          attachment={selectedAttachment}
          canManage={canManage}
          bindForm={bindForm}
          entityItems={bindEntityItems}
          actingKey={actingKey}
          onBindFormChange={setBindForm}
          onBind={() => void handleBind()}
          onUnbind={() => void handleUnbind()}
        />
      </section>
    </div>
  );
}

export function AttachmentFilterBar({
  workspace,
  value,
  entityItems,
  onChange,
  onApply,
}: {
  workspace: AttachmentWorkspaceResponse;
  value: AttachmentWorkspaceFilters;
  entityItems: Array<{ id: string; label: string; subtitle: string | null }>;
  onChange: (nextValue: AttachmentWorkspaceFilters) => void;
  onApply: () => void;
}) {
  return (
    <div className="form-grid">
      <label className="field">
        <span>实体类型</span>
        <select
          value={value.entityType ?? ''}
          onChange={(event) =>
            onChange({
              ...value,
              entityType: (event.target.value as AttachmentEntityType | '') || '',
              entityId: '',
            })
          }
        >
          <option value="">全部</option>
          {workspace.entityOptions.map((option) => (
            <option key={option.entityType} value={option.entityType}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>实体对象</span>
        <select
          value={value.entityId ?? ''}
          disabled={!value.entityType}
          onChange={(event) => onChange({ ...value, entityId: event.target.value })}
        >
          <option value="">{value.entityType ? '全部' : '请先选择实体类型'}</option>
          {entityItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
              {item.subtitle ? ` / ${item.subtitle}` : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="field checkbox-field">
        <span>包含已删除</span>
        <input
          type="checkbox"
          checked={Boolean(value.includeDeleted)}
          onChange={(event) => onChange({ ...value, includeDeleted: event.target.checked })}
        />
      </label>
      <div className="field field-actions">
        <button type="button" className="button button-secondary" onClick={onApply}>
          应用筛选
        </button>
      </div>
    </div>
  );
}

export function AttachmentUploader({
  workspace,
  value,
  entityItems,
  disabled,
  onChange,
  onUpload,
}: {
  workspace: AttachmentWorkspaceResponse;
  value: UploadFormState;
  entityItems: Array<{ id: string; label: string; subtitle: string | null }>;
  disabled: boolean;
  onChange: (nextValue: UploadFormState) => void;
  onUpload: () => void;
}) {
  return (
    <div className="form-grid">
      <label className="field">
        <span>归属类型</span>
        <select
          disabled={disabled}
          value={value.entityType}
          onChange={(event) =>
            onChange({
              ...value,
              entityType: event.target.value as AttachmentEntityType,
              entityId:
                event.target.value === 'PROJECT'
                  ? workspace.project.id
                  : (workspace.entityOptions.find(
                      (item) => item.entityType === event.target.value,
                    )?.items[0]?.id ?? ''),
            })
          }
        >
          {workspace.entityOptions.map((option) => (
            <option key={option.entityType} value={option.entityType}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>归属实体</span>
        <select
          disabled={disabled || value.entityType === 'PROJECT'}
          value={value.entityId}
          onChange={(event) => onChange({ ...value, entityId: event.target.value })}
        >
          {entityItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
              {item.subtitle ? ` / ${item.subtitle}` : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="field field-full">
        <span>选择文件</span>
        <input
          type="file"
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...value,
              file: event.target.files?.[0] ?? null,
            })
          }
        />
      </label>
      <div className="field field-actions">
        <button type="button" className="button" disabled={disabled} onClick={onUpload}>
          {disabled ? '不可上传' : '上传附件'}
        </button>
      </div>
    </div>
  );
}

export function AttachmentList({
  items,
  selectedAttachmentId,
  canManage,
  actingKey,
  onSelect,
  onDelete,
}: {
  items: ProjectAttachmentSummary[];
  selectedAttachmentId: string | null;
  canManage: boolean;
  actingKey: string | null;
  onSelect: (attachmentId: string) => void;
  onDelete: (attachment: ProjectAttachmentSummary) => void;
}) {
  return (
    <div className="table-shell">
      <table className="data-table">
        <thead>
          <tr>
            <th>文件名</th>
            <th>归属</th>
            <th>类型</th>
            <th>大小</th>
            <th>上传人</th>
            <th>上传时间</th>
            <th>状态</th>
            <th>动作</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={8}>
                <div className="empty-state">
                  <strong>暂无附件</strong>
                  <p>上传项目附件或筛选其他业务实体后，这里会展示对应记录。</p>
                </div>
              </td>
            </tr>
          ) : (
            items.map((attachment) =>
              attachment.isDeleted ? (
                <DeletedAttachmentRow
                  key={attachment.id}
                  attachment={attachment}
                  isSelected={selectedAttachmentId === attachment.id}
                  onSelect={onSelect}
                />
              ) : (
                <tr
                  key={attachment.id}
                  className={selectedAttachmentId === attachment.id ? 'row-selected' : undefined}
                  onClick={() => onSelect(attachment.id)}
                >
                  <td>{attachment.originalFileName}</td>
                  <td>{attachment.entityLabel}</td>
                  <td>
                    <AttachmentEntityBadge entityType={attachment.entityType} />
                  </td>
                  <td>{formatAttachmentSize(attachment.fileSize)}</td>
                  <td>{attachment.uploadedByName ?? '未知'}</td>
                  <td>{formatAttachmentTime(attachment.uploadedAt)}</td>
                  <td>有效</td>
                  <td>
                    <AttachmentActionMenu
                      attachment={attachment}
                      canManage={canManage}
                      actingKey={actingKey}
                      onDelete={onDelete}
                    />
                  </td>
                </tr>
              ),
            )
          )}
        </tbody>
      </table>
    </div>
  );
}

export function AttachmentPreviewPanel({
  projectId,
  attachment,
  canManage,
  bindForm,
  entityItems,
  actingKey,
  onBindFormChange,
  onBind,
  onUnbind,
}: {
  projectId: string;
  attachment: ProjectAttachmentSummary | null;
  canManage: boolean;
  bindForm: BindFormState;
  entityItems: Array<{ id: string; label: string; subtitle: string | null }>;
  actingKey: string | null;
  onBindFormChange: (nextValue: BindFormState) => void;
  onBind: () => void;
  onUnbind: () => void;
}) {
  if (!attachment) {
    return (
      <div className="empty-state">
        <strong>请选择一条附件记录</strong>
        <p>右侧会展示附件元数据、预览和绑定信息。</p>
      </div>
    );
  }

  const previewKind = getAttachmentPreviewKind(attachment);
  const previewUrl = getAttachmentPreviewUrl(attachment);
  const downloadUrl = getAttachmentDownloadUrl(attachment);

  return (
    <div className="page-stack compact">
      <div className="metadata-grid">
        <div className="metadata-item">
          <span>文件名</span>
          <strong>{attachment.originalFileName}</strong>
        </div>
        <div className="metadata-item">
          <span>业务归属</span>
          <strong>{attachment.entityLabel}</strong>
        </div>
        <div className="metadata-item">
          <span>文件类型</span>
          <strong>{attachment.mimeType}</strong>
        </div>
        <div className="metadata-item">
          <span>当前状态</span>
          <strong>{attachment.isDeleted ? '已删除' : '有效'}</strong>
        </div>
      </div>

      <div className="detail-block">
        <h3>文件预览</h3>
        {attachment.isDeleted ? (
          <p>已删除附件不提供在线预览。</p>
        ) : previewKind === 'image' && previewUrl ? (
          <img
            src={previewUrl}
            alt={attachment.originalFileName}
            className="attachment-preview-image"
          />
        ) : previewKind === 'pdf' && previewUrl ? (
          <iframe
            title={attachment.originalFileName}
            src={previewUrl}
            className="attachment-preview-frame"
          />
        ) : (
          <p>当前文件类型不支持内嵌预览，请直接下载查看。</p>
        )}
      </div>

      <div className="inline-actions">
        {!attachment.isDeleted ? (
          <a
            href={downloadUrl}
            className="button button-secondary"
            target="_blank"
            rel="noreferrer"
          >
            下载附件
          </a>
        ) : null}
        {attachment.entityType !== 'PROJECT' ? (
          <Link
            href={`/projects/${projectId}/attachments?entityType=${attachment.entityType}&entityId=${attachment.entityId}`}
            className="button button-secondary"
          >
            查看同实体附件
          </Link>
        ) : null}
      </div>

      <div className="detail-block">
        <h3>绑定关系</h3>
        <div className="form-grid">
          <label className="field">
            <span>绑定类型</span>
            <select
              disabled={!canManage || attachment.isDeleted}
              value={bindForm.entityType}
              onChange={(event) =>
                onBindFormChange({
                  entityType: event.target.value as AttachmentEntityType,
                  entityId: event.target.value === 'PROJECT' ? projectId : '',
                })
              }
            >
              <option value="PROJECT">项目</option>
              <option value="SAMPLE">样板</option>
              <option value="STANDARD_BOARD">标准板</option>
              <option value="PERFORMANCE_TEST">性能试验</option>
              <option value="REVIEW_RECORD">评审记录</option>
              <option value="NEW_COLOR_REPORT">开发报告</option>
              <option value="TRIAL_PRODUCTION">样车试制</option>
            </select>
          </label>
          <label className="field">
            <span>绑定实体</span>
            <select
              disabled={!canManage || attachment.isDeleted || bindForm.entityType === 'PROJECT'}
              value={bindForm.entityId}
              onChange={(event) =>
                onBindFormChange({
                  ...bindForm,
                  entityId: event.target.value,
                })
              }
            >
              {bindForm.entityType === 'PROJECT' ? (
                <option value={projectId}>当前项目</option>
              ) : (
                entityItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                    {item.subtitle ? ` / ${item.subtitle}` : ''}
                  </option>
                ))
              )}
            </select>
          </label>
          <div className="field field-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={!canManage || attachment.isDeleted || actingKey === `bind:${attachment.id}`}
              onClick={onBind}
            >
              {actingKey === `bind:${attachment.id}` ? '绑定中…' : '更新绑定'}
            </button>
          </div>
          <div className="field field-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={
                !canManage ||
                attachment.isDeleted ||
                attachment.entityType === 'PROJECT' ||
                actingKey === `unbind:${attachment.id}`
              }
              onClick={onUnbind}
            >
              {actingKey === `unbind:${attachment.id}` ? '解绑中…' : '解绑为项目附件'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AttachmentEntityBadge({
  entityType,
}: {
  entityType: AttachmentEntityType;
}) {
  return <span className="status-badge status-ready">{getAttachmentEntityTypeLabel(entityType)}</span>;
}

export function AttachmentActionMenu({
  attachment,
  canManage,
  actingKey,
  onDelete,
}: {
  attachment: ProjectAttachmentSummary;
  canManage: boolean;
  actingKey: string | null;
  onDelete: (attachment: ProjectAttachmentSummary) => void;
}) {
  return (
    <div className="task-actions">
      <a
        href={getAttachmentDownloadUrl(attachment)}
        className="button button-secondary button-small"
        target="_blank"
        rel="noreferrer"
        onClick={(event) => event.stopPropagation()}
      >
        下载
      </a>
      {canManage && !attachment.isDeleted ? (
        <button
          type="button"
          className="button button-secondary button-small"
          disabled={actingKey === `delete:${attachment.id}`}
          onClick={(event) => {
            event.stopPropagation();
            onDelete(attachment);
          }}
        >
          {actingKey === `delete:${attachment.id}` ? '删除中…' : '删除'}
        </button>
      ) : null}
    </div>
  );
}

export function DeletedAttachmentRow({
  attachment,
  isSelected,
  onSelect,
}: {
  attachment: ProjectAttachmentSummary;
  isSelected: boolean;
  onSelect: (attachmentId: string) => void;
}) {
  return (
    <tr
      className={`${isSelected ? 'row-selected ' : ''}row-deleted`}
      onClick={() => onSelect(attachment.id)}
    >
      <td>{attachment.originalFileName}</td>
      <td>{attachment.entityLabel}</td>
      <td>
        <AttachmentEntityBadge entityType={attachment.entityType} />
      </td>
      <td>{formatAttachmentSize(attachment.fileSize)}</td>
      <td>{attachment.uploadedByName ?? '未知'}</td>
      <td>{formatAttachmentTime(attachment.uploadedAt)}</td>
      <td>已删除</td>
      <td>{attachment.deletedByName ?? '系统'} / {formatAttachmentTime(attachment.deletedAt)}</td>
    </tr>
  );
}
