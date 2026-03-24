'use client';

import Link from 'next/link';
import React, { useEffect, useRef, useState } from 'react';

import { useAuth } from './auth-provider';
import {
  addBoardDistributionRecord,
  canManageStandardBoards,
  canShowCompleteBoardDetailUpdateTaskButton,
  canShowCompleteStandardBoardTaskButton,
  completeColorBoardDetailUpdateTask,
  completeStandardBoardTask,
  createColorBoardDetailUpdate,
  createStandardBoard,
  fetchStandardBoardWorkspace,
  getColorBoardDetailUpdateStatusLabel,
  getStandardBoardStatusLabel,
  getStandardBoardWorkspaceHighlights,
  issueStandardBoard,
  markStandardBoardCreated,
  setCurrentStandardBoard,
  updateStandardBoard,
  validateColorBoardDetailUpdateForm,
  validateDistributionRecordForm,
  validateIssueBoardForm,
  validateStandardBoardForm,
  COLOR_BOARD_DETAIL_UPDATE_STATUS_OPTIONS,
  type BoardDistributionRecord,
  type ColorBoardDetailUpdateFormInput,
  type ColorBoardDetailUpdateRecord,
  type DistributionRecordFormInput,
  type IssueBoardFormInput,
  type StandardBoardFormInput,
  type StandardBoardSummary,
  type StandardBoardWorkspaceResponse,
} from '../lib/standard-boards-client';
import { formatDate } from '../lib/projects-client';
import { isWorkflowTaskOverdue } from '../lib/workflows-client';

type StandardBoardsWorkspaceProps = {
  projectId: string;
};

const EMPTY_BOARD_FORM: StandardBoardFormInput = {
  boardCode: '',
  versionNo: '1',
  basedOnSampleId: '',
  remark: '',
};

const EMPTY_ISSUE_FORM: IssueBoardFormInput = {
  recipientName: '',
  recipientDept: '',
  issuedAt: '',
  remark: '',
};

const EMPTY_DISTRIBUTION_FORM: DistributionRecordFormInput = {
  receiverName: '',
  receiverDept: '',
  sentAt: '',
  signedAt: '',
  note: '',
};

const EMPTY_DETAIL_UPDATE_FORM: ColorBoardDetailUpdateFormInput = {
  standardBoardId: '',
  updateStatus: 'UPDATED',
  detailUpdatedAt: '',
  note: '',
};

export function StandardBoardsWorkspace({
  projectId,
}: StandardBoardsWorkspaceProps) {
  const { user } = useAuth();
  const requestIdRef = useRef(0);
  const [workspace, setWorkspace] = useState<StandardBoardWorkspaceResponse | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [boardForm, setBoardForm] = useState<StandardBoardFormInput>(EMPTY_BOARD_FORM);
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [issueForm, setIssueForm] = useState<IssueBoardFormInput>(EMPTY_ISSUE_FORM);
  const [distributionForm, setDistributionForm] =
    useState<DistributionRecordFormInput>(EMPTY_DISTRIBUTION_FORM);
  const [detailUpdateForm, setDetailUpdateForm] =
    useState<ColorBoardDetailUpdateFormInput>(EMPTY_DETAIL_UPDATE_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingBoard, setIsSavingBoard] = useState(false);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadWorkspace({ initial: true });
  }, [projectId]);

  useEffect(() => {
    if (!workspace?.items.length) {
      setSelectedBoardId(null);
      setDetailUpdateForm((current) => ({
        ...current,
        standardBoardId: '',
      }));
      return;
    }

    const exists = selectedBoardId
      ? workspace.items.some((item) => item.id === selectedBoardId)
      : false;
    const nextBoardId =
      exists
        ? selectedBoardId
        : (workspace.currentBoard?.id ?? workspace.items[0]?.id ?? null);

    if (nextBoardId !== selectedBoardId) {
      setSelectedBoardId(nextBoardId);
    }

    if (!detailUpdateForm.standardBoardId && nextBoardId) {
      setDetailUpdateForm((current) => ({
        ...current,
        standardBoardId: nextBoardId,
      }));
    }
  }, [workspace, selectedBoardId, detailUpdateForm.standardBoardId]);

  const canManage = canManageStandardBoards(user);
  const highlights = workspace ? getStandardBoardWorkspaceHighlights(workspace) : null;
  const selectedBoard =
    workspace?.items.find((item) => item.id === selectedBoardId) ??
    workspace?.currentBoard ??
    null;
  const canEditBoardStage = Boolean(workspace?.activeStandardBoardTask);
  const canEditDetailUpdateStage = Boolean(workspace?.activeColorBoardDetailUpdateTask);

  async function loadWorkspace(options?: { initial?: boolean }) {
    const requestId = ++requestIdRef.current;

    if (options?.initial) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    setError(null);

    try {
      const response = await fetchStandardBoardWorkspace(projectId);

      if (requestId !== requestIdRef.current) {
        return;
      }

      setWorkspace(response);
      setDetailUpdateForm((current) => ({
        ...current,
        standardBoardId:
          current.standardBoardId &&
          response.items.some((item) => item.id === current.standardBoardId)
            ? current.standardBoardId
            : (response.currentBoard?.id ?? response.items[0]?.id ?? ''),
      }));
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : '标准板工作区加载失败。');
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  async function handleSaveBoard() {
    const validationMessage = validateStandardBoardForm(boardForm);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setIsSavingBoard(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace = editingBoardId
        ? await updateStandardBoard(projectId, editingBoardId, boardForm)
        : await createStandardBoard(projectId, boardForm);

      setWorkspace(nextWorkspace);
      setSuccessMessage(editingBoardId ? '标准板已更新。' : '标准板已创建。');
      setEditingBoardId(null);
      setBoardForm(EMPTY_BOARD_FORM);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '标准板保存失败。');
    } finally {
      setIsSavingBoard(false);
    }
  }

  async function handleIssueBoard() {
    if (!selectedBoard) {
      setError('请先选择一条标准板记录。');
      return;
    }

    const validationMessage = validateIssueBoardForm(issueForm);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setActingKey(`issue:${selectedBoard.id}`);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace = await issueStandardBoard(projectId, selectedBoard.id, issueForm);
      setWorkspace(nextWorkspace);
      setSuccessMessage('标准板已标记为已下发。');
      setIssueForm(EMPTY_ISSUE_FORM);
    } catch (issueError) {
      setError(issueError instanceof Error ? issueError.message : '标准板下发失败。');
    } finally {
      setActingKey(null);
    }
  }

  async function handleAddDistribution() {
    if (!selectedBoard) {
      setError('请先选择一条标准板记录。');
      return;
    }

    const validationMessage = validateDistributionRecordForm(distributionForm);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setActingKey(`distribution:${selectedBoard.id}`);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace = await addBoardDistributionRecord(
        projectId,
        selectedBoard.id,
        distributionForm,
      );
      setWorkspace(nextWorkspace);
      setSuccessMessage('下发记录已新增。');
      setDistributionForm(EMPTY_DISTRIBUTION_FORM);
    } catch (distributionError) {
      setError(
        distributionError instanceof Error
          ? distributionError.message
          : '下发记录新增失败。',
      );
    } finally {
      setActingKey(null);
    }
  }

  async function handleCreateDetailUpdate() {
    const validationMessage = validateColorBoardDetailUpdateForm(detailUpdateForm);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setActingKey('create-detail-update');
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace = await createColorBoardDetailUpdate(projectId, detailUpdateForm);
      setWorkspace(nextWorkspace);
      setSuccessMessage('色板明细更新记录已创建。');
      setDetailUpdateForm((current) => ({
        ...EMPTY_DETAIL_UPDATE_FORM,
        standardBoardId:
          current.standardBoardId ||
          nextWorkspace.currentBoard?.id ||
          nextWorkspace.items[0]?.id ||
          '',
      }));
    } catch (detailUpdateError) {
      setError(
        detailUpdateError instanceof Error
          ? detailUpdateError.message
          : '色板明细更新记录创建失败。',
      );
    } finally {
      setActingKey(null);
    }
  }

  async function handleBoardAction(
    action: 'SET_CURRENT' | 'MARK_CREATED' | 'COMPLETE_STANDARD' | 'COMPLETE_DETAIL',
    board?: StandardBoardSummary,
  ) {
    const key =
      action === 'SET_CURRENT' && board
        ? `set-current:${board.id}`
        : action === 'MARK_CREATED' && board
          ? `mark-created:${board.id}`
          : action;
    setActingKey(key);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace =
        action === 'SET_CURRENT' && board
          ? await setCurrentStandardBoard(projectId, board.id)
          : action === 'MARK_CREATED' && board
            ? await markStandardBoardCreated(projectId, board.id)
            : action === 'COMPLETE_STANDARD'
              ? await completeStandardBoardTask(projectId)
              : await completeColorBoardDetailUpdateTask(projectId);

      setWorkspace(nextWorkspace);
      setSuccessMessage(
        action === 'SET_CURRENT'
          ? '当前有效标准板已更新。'
          : action === 'MARK_CREATED'
            ? '标准板已标记为已制作。'
            : action === 'COMPLETE_STANDARD'
              ? '标准板制作、下发节点已完成，色板明细更新已激活。'
              : '色板明细更新节点已完成。',
      );
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '标准板动作执行失败。');
    } finally {
      setActingKey(null);
    }
  }

  function prepareEditBoard(board: StandardBoardSummary) {
    setEditingBoardId(board.id);
    setSelectedBoardId(board.id);
    setBoardForm({
      boardCode: board.boardCode,
      versionNo: String(board.versionNo),
      basedOnSampleId: board.basedOnSampleId ?? '',
      remark: board.remark ?? '',
    });
  }

  function resetBoardForm() {
    setEditingBoardId(null);
    setBoardForm(EMPTY_BOARD_FORM);
  }

  if (isLoading || !workspace || !highlights) {
    return (
      <section className="page-card">
        <p className="eyebrow">Standard Boards</p>
        <h1>正在加载标准板模块…</h1>
        <p>标准板版本、下发记录和色板明细更新状态正在同步。</p>
      </section>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Standard Boards</p>
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
            <span>采购完成状态</span>
            <strong>{workspace.procurementCompleted ? '已完成' : '未完成'}</strong>
          </div>
          <div className="metadata-item">
            <span>标准板任务状态</span>
            <strong>{highlights.standardBoardTaskStatusLabel}</strong>
          </div>
          <div className="metadata-item">
            <span>明细更新任务状态</span>
            <strong>{highlights.detailUpdateTaskStatusLabel}</strong>
          </div>
          <div className="metadata-item">
            <span>当前有效版本</span>
            <strong>
              {workspace.currentBoard
                ? `${workspace.currentBoard.boardCode} V${workspace.currentBoard.versionNo}`
                : '未设置'}
            </strong>
          </div>
        </div>
        {workspace.activeStandardBoardTask &&
        isWorkflowTaskOverdue(workspace.activeStandardBoardTask) ? (
          <p className="error-text">当前标准板制作、下发任务已超期。</p>
        ) : null}
        {workspace.activeColorBoardDetailUpdateTask &&
        isWorkflowTaskOverdue(workspace.activeColorBoardDetailUpdateTask) ? (
          <p className="error-text">当前色板明细更新任务已超期。</p>
        ) : null}
        {!workspace.procurementCompleted ? (
          <p className="muted">采购节点完成后才会激活标准板制作、下发任务。</p>
        ) : null}
      </section>

      {error ? <p className="error-text">{error}</p> : null}
      {successMessage ? <p className="success-text">{successMessage}</p> : null}

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Node Completion</p>
            <h2 className="section-title">标准板与色板明细节点完成</h2>
            <p className="muted">
              至少存在一条已下发标准板后，才允许完成标准板节点；标准板节点完成后，才会激活色板明细更新。
            </p>
          </div>
        </div>
        {workspace.standardBoardCompletionIssue ? (
          <p className="muted">{workspace.standardBoardCompletionIssue}</p>
        ) : null}
        <div className="inline-actions">
          <CompleteStandardBoardTaskButton
            disabled={
              actingKey === 'COMPLETE_STANDARD' ||
              !canShowCompleteStandardBoardTaskButton(user, workspace)
            }
            onClick={() => void handleBoardAction('COMPLETE_STANDARD')}
          />
          <CompleteBoardDetailUpdateTaskButton
            disabled={
              actingKey === 'COMPLETE_DETAIL' ||
              !canShowCompleteBoardDetailUpdateTaskButton(user, workspace)
            }
            onClick={() => void handleBoardAction('COMPLETE_DETAIL')}
          />
        </div>
        {workspace.colorBoardDetailUpdateCompletionIssue ? (
          <p className="muted">{workspace.colorBoardDetailUpdateCompletionIssue}</p>
        ) : null}
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Board Form</p>
            <h2 className="section-title">标准板版本管理</h2>
            <p className="muted">支持创建版本、编辑基础信息和设置当前有效版本。</p>
          </div>
          <div className="inline-actions">
            <button type="button" className="button button-secondary" onClick={resetBoardForm}>
              重置表单
            </button>
          </div>
        </div>
        <StandardBoardForm
          value={boardForm}
          sampleOptions={workspace.sampleOptions}
          disabled={!canManage || !canEditBoardStage || isSavingBoard}
          submitLabel={editingBoardId ? '更新标准板' : '新建标准板'}
          onChange={setBoardForm}
          onSubmit={() => void handleSaveBoard()}
        />
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Board List</p>
            <h2 className="section-title">标准板列表</h2>
            <p className="muted">点击列表可查看详情、下发记录和版本关系。</p>
          </div>
        </div>
        <StandardBoardList
          items={workspace.items}
          selectedBoardId={selectedBoardId}
          canManage={canManage}
          isReadOnly={!canEditBoardStage}
          actingKey={actingKey}
          onSelect={setSelectedBoardId}
          onEdit={prepareEditBoard}
          onSetCurrent={(board) => void handleBoardAction('SET_CURRENT', board)}
          onMarkCreated={(board) => void handleBoardAction('MARK_CREATED', board)}
        />
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Board Detail</p>
            <h2 className="section-title">标准板详情与下发</h2>
            <p className="muted">在这里查看当前版本详情、执行下发并维护下发记录。</p>
          </div>
          {selectedBoard ? (
            <div className="inline-actions">
              <Link
                href={`/projects/${projectId}/attachments?entityType=STANDARD_BOARD&entityId=${selectedBoard.id}`}
                className="button button-secondary"
              >
                查看附件中心
              </Link>
            </div>
          ) : null}
        </div>
        <StandardBoardDetailCard
          board={selectedBoard}
          canManage={canManage}
          canEditBoardStage={canEditBoardStage}
          issueForm={issueForm}
          distributionForm={distributionForm}
          actingKey={actingKey}
          onIssueFormChange={setIssueForm}
          onDistributionFormChange={setDistributionForm}
          onIssue={() => void handleIssueBoard()}
          onAddDistribution={() => void handleAddDistribution()}
        />
        <BoardVersionPanel
          items={workspace.items}
          currentBoardId={workspace.currentBoard?.id ?? null}
          selectedBoard={selectedBoard}
          onSelect={setSelectedBoardId}
        />
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Detail Update</p>
            <h2 className="section-title">色板明细更新</h2>
            <p className="muted">标准板节点完成后，可记录色板明细更新状态并完成子节点。</p>
          </div>
        </div>
        <ColorBoardDetailUpdatePanel
          items={workspace.detailUpdates}
          boards={workspace.items}
          currentBoardId={workspace.currentBoard?.id ?? null}
          value={detailUpdateForm}
          disabled={!canManage || !canEditDetailUpdateStage || actingKey === 'create-detail-update'}
          canEditStage={canEditDetailUpdateStage}
          onChange={setDetailUpdateForm}
          onSubmit={() => void handleCreateDetailUpdate()}
        />
      </section>
    </div>
  );
}

export function StandardBoardForm({
  value,
  sampleOptions,
  disabled,
  submitLabel,
  onChange,
  onSubmit,
}: {
  value: StandardBoardFormInput;
  sampleOptions: StandardBoardWorkspaceResponse['sampleOptions'];
  disabled: boolean;
  submitLabel: string;
  onChange: (nextValue: StandardBoardFormInput) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="field">
        <span>标准板编号</span>
        <input
          required
          disabled={disabled}
          value={value.boardCode}
          onChange={(event) => onChange({ ...value, boardCode: event.target.value })}
        />
      </label>
      <label className="field">
        <span>版本号</span>
        <input
          required
          type="number"
          min={1}
          disabled={disabled}
          value={value.versionNo}
          onChange={(event) => onChange({ ...value, versionNo: event.target.value })}
        />
      </label>
      <label className="field">
        <span>关联样板</span>
        <select
          disabled={disabled}
          value={value.basedOnSampleId}
          onChange={(event) => onChange({ ...value, basedOnSampleId: event.target.value })}
        >
          <option value="">未绑定样板</option>
          {sampleOptions.map((sample) => (
            <option key={sample.id} value={sample.id}>
              {sample.sampleNo} / {sample.sampleName} / V{sample.versionNo}
            </option>
          ))}
        </select>
      </label>
      <label className="field field-full">
        <span>备注</span>
        <textarea
          rows={4}
          disabled={disabled}
          value={value.remark}
          onChange={(event) => onChange({ ...value, remark: event.target.value })}
        />
      </label>
      <div className="field field-actions">
        <button type="submit" className="button" disabled={disabled}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

export function StandardBoardList({
  items,
  selectedBoardId,
  canManage,
  isReadOnly,
  actingKey,
  onSelect,
  onEdit,
  onSetCurrent,
  onMarkCreated,
}: {
  items: StandardBoardSummary[];
  selectedBoardId: string | null;
  canManage: boolean;
  isReadOnly: boolean;
  actingKey: string | null;
  onSelect: (boardId: string) => void;
  onEdit: (board: StandardBoardSummary) => void;
  onSetCurrent: (board: StandardBoardSummary) => void;
  onMarkCreated: (board: StandardBoardSummary) => void;
}) {
  return (
    <div className="table-shell">
      <table className="data-table">
        <thead>
          <tr>
            <th>标准板编号</th>
            <th>版本</th>
            <th>关联样板</th>
            <th>状态</th>
            <th>当前版本</th>
            <th>下发时间</th>
            <th>动作</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={7}>
                <div className="empty-state">
                  <strong>暂无标准板记录</strong>
                  <p>采购完成且标准板任务激活后，可在这里创建标准板版本。</p>
                </div>
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr
                key={item.id}
                className={selectedBoardId === item.id ? 'row-selected' : undefined}
                onClick={() => onSelect(item.id)}
              >
                <td>{item.boardCode}</td>
                <td>V{item.versionNo}</td>
                <td>
                  {item.basedOnSample
                    ? `${item.basedOnSample.sampleNo} / ${item.basedOnSample.sampleName}`
                    : '未绑定'}
                </td>
                <td>
                  <BoardStatusBadge status={item.status} />
                </td>
                <td>{item.isCurrent ? '当前有效' : '历史版本'}</td>
                <td>{formatDate(item.issuedAt)}</td>
                <td>
                  <div className="task-actions">
                    {canManage && !isReadOnly ? (
                      <>
                        <button
                          type="button"
                          className="button button-secondary button-small"
                          onClick={(event) => {
                            event.stopPropagation();
                            onEdit(item);
                          }}
                        >
                          编辑
                        </button>
                        <SetCurrentBoardButton
                          disabled={
                            item.isCurrent ||
                            item.status === 'ARCHIVED' ||
                            actingKey === `set-current:${item.id}`
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            onSetCurrent(item);
                          }}
                        />
                        <button
                          type="button"
                          className="button button-secondary button-small"
                          disabled={
                            item.status !== 'DRAFT' ||
                            actingKey === `mark-created:${item.id}`
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            onMarkCreated(item);
                          }}
                        >
                          {actingKey === `mark-created:${item.id}` ? '处理中…' : '标记已制作'}
                        </button>
                      </>
                    ) : (
                      <span className="muted">只读</span>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function StandardBoardDetailCard({
  board,
  canManage,
  canEditBoardStage,
  issueForm,
  distributionForm,
  actingKey,
  onIssueFormChange,
  onDistributionFormChange,
  onIssue,
  onAddDistribution,
}: {
  board: StandardBoardSummary | null;
  canManage: boolean;
  canEditBoardStage: boolean;
  issueForm: IssueBoardFormInput;
  distributionForm: DistributionRecordFormInput;
  actingKey: string | null;
  onIssueFormChange: (nextValue: IssueBoardFormInput) => void;
  onDistributionFormChange: (nextValue: DistributionRecordFormInput) => void;
  onIssue: () => void;
  onAddDistribution: () => void;
}) {
  if (!board) {
    return (
      <div className="empty-state">
        <strong>请选择一条标准板记录</strong>
        <p>右侧会展示标准板详情、版本信息和下发记录。</p>
      </div>
    );
  }

  const canIssue = canManage && canEditBoardStage && board.status === 'CREATED';
  const canAddDistribution =
    canManage && canEditBoardStage && board.status === 'ISSUED';

  return (
    <div className="page-stack">
      <div className="detail-grid">
        <div className="detail-item">
          <span>标准板编号</span>
          <strong>{board.boardCode}</strong>
        </div>
        <div className="detail-item">
          <span>版本号</span>
          <strong>V{board.versionNo}</strong>
        </div>
        <div className="detail-item">
          <span>状态</span>
          <strong>{getStandardBoardStatusLabel(board.status)}</strong>
        </div>
        <div className="detail-item">
          <span>当前有效版本</span>
          <strong>{board.isCurrent ? '是' : '否'}</strong>
        </div>
        <div className="detail-item">
          <span>关联样板</span>
          <strong>
            {board.basedOnSample
              ? `${board.basedOnSample.sampleNo} / ${board.basedOnSample.sampleName}`
              : '未绑定'}
          </strong>
        </div>
        <div className="detail-item">
          <span>下发信息</span>
          <strong>
            {board.recipientName || board.recipientDept
              ? `${board.recipientName ?? '未填'} / ${board.recipientDept ?? '未填'}`
              : '未填写'}
          </strong>
        </div>
        <div className="detail-item">
          <span>制作时间</span>
          <strong>{formatDate(board.producedAt)}</strong>
        </div>
        <div className="detail-item">
          <span>下发时间</span>
          <strong>{formatDate(board.issuedAt)}</strong>
        </div>
        <div className="detail-item detail-item-full">
          <span>备注</span>
          <strong>{board.remark ?? '无'}</strong>
        </div>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>接收人</span>
          <input
            disabled={!canIssue}
            value={issueForm.recipientName}
            onChange={(event) =>
              onIssueFormChange({ ...issueForm, recipientName: event.target.value })
            }
          />
        </label>
        <label className="field">
          <span>接收部门</span>
          <input
            disabled={!canIssue}
            value={issueForm.recipientDept}
            onChange={(event) =>
              onIssueFormChange({ ...issueForm, recipientDept: event.target.value })
            }
          />
        </label>
        <label className="field">
          <span>下发时间</span>
          <input
            type="datetime-local"
            disabled={!canIssue}
            value={issueForm.issuedAt}
            onChange={(event) =>
              onIssueFormChange({ ...issueForm, issuedAt: event.target.value })
            }
          />
        </label>
        <label className="field field-full">
          <span>下发备注</span>
          <textarea
            rows={3}
            disabled={!canIssue}
            value={issueForm.remark}
            onChange={(event) =>
              onIssueFormChange({ ...issueForm, remark: event.target.value })
            }
          />
        </label>
        <div className="field field-actions">
          <IssueBoardButton
            disabled={!canIssue || actingKey === `issue:${board.id}`}
            onClick={() => onIssue()}
          />
        </div>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>接收人</span>
          <input
            disabled={!canAddDistribution}
            value={distributionForm.receiverName}
            onChange={(event) =>
              onDistributionFormChange({
                ...distributionForm,
                receiverName: event.target.value,
              })
            }
          />
        </label>
        <label className="field">
          <span>接收部门</span>
          <input
            disabled={!canAddDistribution}
            value={distributionForm.receiverDept}
            onChange={(event) =>
              onDistributionFormChange({
                ...distributionForm,
                receiverDept: event.target.value,
              })
            }
          />
        </label>
        <label className="field">
          <span>发送时间</span>
          <input
            type="datetime-local"
            disabled={!canAddDistribution}
            value={distributionForm.sentAt}
            onChange={(event) =>
              onDistributionFormChange({ ...distributionForm, sentAt: event.target.value })
            }
          />
        </label>
        <label className="field">
          <span>签收时间</span>
          <input
            type="datetime-local"
            disabled={!canAddDistribution}
            value={distributionForm.signedAt}
            onChange={(event) =>
              onDistributionFormChange({
                ...distributionForm,
                signedAt: event.target.value,
              })
            }
          />
        </label>
        <label className="field field-full">
          <span>备注</span>
          <textarea
            rows={3}
            disabled={!canAddDistribution}
            value={distributionForm.note}
            onChange={(event) =>
              onDistributionFormChange({ ...distributionForm, note: event.target.value })
            }
          />
        </label>
        <div className="field field-actions">
          <button
            type="button"
            className="button"
            disabled={!canAddDistribution || actingKey === `distribution:${board.id}`}
            onClick={() => onAddDistribution()}
          >
            {actingKey === `distribution:${board.id}` ? '处理中…' : '新增下发记录'}
          </button>
        </div>
      </div>

      <DistributionRecordTable items={board.distributions} />
    </div>
  );
}

export function BoardVersionPanel({
  items,
  currentBoardId,
  selectedBoard,
  onSelect,
}: {
  items: StandardBoardSummary[];
  currentBoardId: string | null;
  selectedBoard: StandardBoardSummary | null;
  onSelect: (boardId: string) => void;
}) {
  if (!selectedBoard) {
    return null;
  }

  const relatedBoards = items.filter(
    (item) => item.boardCode === selectedBoard.boardCode,
  );

  return (
    <div className="detail-grid">
      {relatedBoards.map((board) => (
        <button
          key={board.id}
          type="button"
          className="detail-item"
          onClick={() => onSelect(board.id)}
        >
          <span>
            {board.boardCode} / V{board.versionNo}
          </span>
          <strong>
            {board.id === currentBoardId ? '当前有效' : getStandardBoardStatusLabel(board.status)}
          </strong>
        </button>
      ))}
    </div>
  );
}

export function DistributionRecordTable({
  items,
}: {
  items: BoardDistributionRecord[];
}) {
  return (
    <div className="table-shell">
      <table className="data-table">
        <thead>
          <tr>
            <th>接收人</th>
            <th>接收部门</th>
            <th>发送时间</th>
            <th>签收时间</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={5}>
                <div className="empty-state">
                  <strong>暂无下发记录</strong>
                  <p>标准板下发后，可在这里记录接收人与签收状态。</p>
                </div>
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.id}>
                <td>{item.receiverName ?? '未填写'}</td>
                <td>{item.receiverDept ?? '未填写'}</td>
                <td>{formatDate(item.sentAt)}</td>
                <td>{formatDate(item.signedAt)}</td>
                <td>{item.note ?? '无'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function BoardStatusBadge({
  status,
}: {
  status: StandardBoardSummary['status'];
}) {
  const className =
    status === 'ISSUED'
      ? 'status-pill status-pill-success'
      : status === 'CREATED'
        ? 'status-pill status-pill-warning'
        : status === 'ARCHIVED'
          ? 'status-pill status-pill-neutral'
          : 'status-pill status-pill-neutral';

  return <span className={className}>{getStandardBoardStatusLabel(status)}</span>;
}

export function SetCurrentBoardButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      className="button button-secondary button-small"
      disabled={disabled}
      onClick={onClick}
    >
      设为当前
    </button>
  );
}

export function IssueBoardButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="button" disabled={disabled} onClick={onClick}>
      标记已下发
    </button>
  );
}

export function ColorBoardDetailUpdatePanel({
  items,
  boards,
  currentBoardId,
  value,
  disabled,
  canEditStage,
  onChange,
  onSubmit,
}: {
  items: ColorBoardDetailUpdateRecord[];
  boards: StandardBoardSummary[];
  currentBoardId: string | null;
  value: ColorBoardDetailUpdateFormInput;
  disabled: boolean;
  canEditStage: boolean;
  onChange: (nextValue: ColorBoardDetailUpdateFormInput) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="page-stack">
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label className="field">
          <span>关联标准板</span>
          <select
            disabled={disabled}
            value={value.standardBoardId}
            onChange={(event) =>
              onChange({ ...value, standardBoardId: event.target.value })
            }
          >
            <option value="">请选择标准板</option>
            {boards.map((board) => (
              <option key={board.id} value={board.id}>
                {board.boardCode} / V{board.versionNo}
                {board.id === currentBoardId ? ' / 当前有效' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>更新状态</span>
          <select
            disabled={disabled}
            value={value.updateStatus}
            onChange={(event) =>
              onChange({
                ...value,
                updateStatus: event.target.value as ColorBoardDetailUpdateFormInput['updateStatus'],
              })
            }
          >
            {COLOR_BOARD_DETAIL_UPDATE_STATUS_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>更新时间</span>
          <input
            type="datetime-local"
            disabled={disabled}
            value={value.detailUpdatedAt}
            onChange={(event) =>
              onChange({ ...value, detailUpdatedAt: event.target.value })
            }
          />
        </label>
        <label className="field field-full">
          <span>备注</span>
          <textarea
            rows={3}
            disabled={disabled}
            value={value.note}
            onChange={(event) => onChange({ ...value, note: event.target.value })}
          />
        </label>
        <div className="field field-actions">
          <button type="submit" className="button" disabled={disabled}>
            新增明细更新记录
          </button>
        </div>
      </form>

      <div className="table-shell">
        <table className="data-table">
          <thead>
            <tr>
              <th>标准板</th>
              <th>更新状态</th>
              <th>更新时间</th>
              <th>更新人</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">
                    <strong>暂无色板明细更新记录</strong>
                    <p>
                      {canEditStage
                        ? '标准板节点完成后，可在这里记录明细更新。'
                        : '标准板节点完成并激活子任务后，才能录入明细更新记录。'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.standardBoard.boardCode} / V{item.standardBoard.versionNo}
                  </td>
                  <td>{getColorBoardDetailUpdateStatusLabel(item.updateStatus)}</td>
                  <td>{formatDate(item.detailUpdatedAt)}</td>
                  <td>{item.updatedByName ?? '系统'}</td>
                  <td>{item.note ?? '无'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CompleteStandardBoardTaskButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="button" disabled={disabled} onClick={onClick}>
      完成标准板节点
    </button>
  );
}

export function CompleteBoardDetailUpdateTaskButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="button button-secondary" disabled={disabled} onClick={onClick}>
      完成色板明细更新节点
    </button>
  );
}
