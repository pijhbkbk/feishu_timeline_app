'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { R26FlowMap } from './flow-map';
import { CloseIcon } from './icons';
import {
  createIdempotencyKey,
  r26Gate3Request,
} from './r26-gate3-client';
import { R26_REAL_FLOW_GEOMETRY } from './real-flow-geometry';
import type {
  R26AssignmentImpactResponse,
  R26AssignmentScope,
  R26FlowMapNode,
  R26Gate3CommandResponse,
  R26MemberDraft,
  R26TaskDetail,
  R26TaskResponse,
  R26WorkspaceResponse,
} from './real-types';
import { RealDataState } from './real-ui';
import type { R26FlowNode, R26NodeStatus } from './types';
import { StatusPill } from './ui';
import { useR26ReadOnlyData } from './use-r26-readonly-data';

const STATUS_LABELS: Record<R26NodeStatus, string> = {
  NOT_STARTED: '未开始',
  PENDING: '待处理',
  IN_PROGRESS: '进行中',
  PENDING_REVIEW: '待评审',
  COMPLETED: '已完成',
  COMPLETED_LATE: '逾期完成',
  OVERDUE: '已逾期',
  RETURNED: '已退回',
  MONTHLY_TRACKING: '月度跟踪中',
  EXIT_PENDING: '待人工决定',
};

export function RealWorkspacePage({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedNodeCode, setSelectedNodeCode] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'flow' | 'members' | 'records'>(
    'flow',
  );
  const [liveData, setLiveData] = useState<R26WorkspaceResponse | null>(null);
  const [editor, setEditor] = useState<MemberEditorState | null>(null);
  const [impact, setImpact] = useState<R26AssignmentImpactResponse | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutationPending, setMutationPending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const initializedSelection = useRef(false);
  const workspacePath = `/v2/projects/${encodeURIComponent(projectId)}/workspace`;
  const { data, error, loading } =
    useR26ReadOnlyData<R26WorkspaceResponse>(workspacePath);
  const workspace = liveData ?? data;
  const nodes = useMemo(
    () => workspace?.flowMap.nodes.map(toDisplayNode) ?? [],
    [workspace],
  );

  useEffect(() => {
    if (data) {
      setLiveData(data);
    }
  }, [data]);

  useEffect(() => {
    if (nodes.length === 0) {
      return;
    }
    const taskId = searchParams.get('taskId');
    const nodeCode = searchParams.get('nodeCode');
    const queryNode =
      (taskId ? nodes.find((node) => node.taskId === taskId) : null) ??
      (nodeCode ? nodes.find((node) => node.code === nodeCode) : null) ??
      null;

    if (queryNode) {
      setSelectedNodeCode(queryNode.code);
      initializedSelection.current = true;
      return;
    }
    if (initializedSelection.current) {
      return;
    }
    initializedSelection.current = true;
    if (window.matchMedia('(max-width: 767px)').matches) {
      setSelectedNodeCode(null);
      return;
    }
    setSelectedNodeCode(
      workspace?.flowMap.currentStepCode ??
      nodes.find((node) => node.status === 'IN_PROGRESS')?.code ??
      nodes[0]?.code ??
      null,
    );
  }, [workspace?.flowMap.currentStepCode, nodes, searchParams]);

  const selectedNode =
    nodes.find((node) => node.code === selectedNodeCode) ?? null;
  const taskPath = selectedNode?.taskId
    ? `/v2/tasks/${encodeURIComponent(selectedNode.taskId)}`
    : null;
  const taskQuery = useR26ReadOnlyData<R26TaskResponse>(taskPath);

  if (loading || error || !workspace) {
    return <RealDataState loading={loading} error={error} label="正在读取真实项目工作区…" />;
  }

  function selectNode(node: R26FlowNode) {
    setSelectedNodeCode(node.code);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('taskId');
    params.delete('nodeCode');
    if (node.taskId) {
      params.set('taskId', node.taskId);
    } else {
      params.set('nodeCode', node.code);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function closeDetail() {
    setSelectedNodeCode(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('taskId');
    params.delete('nodeCode');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const attention = [
    `逾期 ${workspace.flowMap.nodes.filter((node) => node.status === 'OVERDUE').length}`,
    `退回 ${workspace.flowMap.nodes.filter((node) => node.status === 'RETURNED').length}`,
    `待评审 ${workspace.flowMap.nodes.filter((node) => node.status === 'PENDING_REVIEW').length}`,
  ].join(' · ');

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2800);
  }

  function openAddMember() {
    setImpact(null);
    setMutationError(null);
    setEditor(createEmptyMemberEditor());
  }

  function openEditMember(
    member: R26WorkspaceResponse['memberAssignments'][number],
  ) {
    setImpact(null);
    setMutationError(null);
    setEditor({
      mode: 'UPDATE',
      userId: member.userId,
      memberTypes: member.roles.map((role) => role.memberType),
      responsibility: member.projectResponsibility,
      isDepartmentLead: member.roles.some(
        (role) => role.memberType === 'MANAGER' && role.isPrimary,
      ),
      isDefaultExecutor: member.roles.some(
        (role) => role.memberType === 'MEMBER' && role.isPrimary,
      ),
      defaultNodeCodes: member.defaultNodes.map((node) => node.nodeCode),
      scope: 'FUTURE_AND_PENDING',
      transferToUserId: '',
      replacementOwnerUserId: '',
      confirmedInProgressTaskIds: [],
      taskId: null,
      newOwnerUserId: '',
      reason: '',
    });
  }

  function openRemoveMember(
    member: R26WorkspaceResponse['memberAssignments'][number],
  ) {
    setImpact(null);
    setMutationError(null);
    setEditor({
      mode: 'REMOVE',
      userId: member.userId,
      memberTypes: member.roles.map((role) => role.memberType),
      responsibility: member.projectResponsibility,
      isDepartmentLead: false,
      isDefaultExecutor: false,
      defaultNodeCodes: [],
      scope: member.currentTasks.length
        ? 'CONFIRM_IN_PROGRESS'
        : 'FUTURE_AND_PENDING',
      transferToUserId: '',
      replacementOwnerUserId: '',
      confirmedInProgressTaskIds: [],
      taskId: null,
      newOwnerUserId: '',
      reason: '',
    });
  }

  function openAssignmentApply() {
    setImpact(null);
    setMutationError(null);
    setEditor({
      ...createEmptyMemberEditor(),
      mode: 'APPLY',
      userId: '',
      memberTypes: [],
    });
  }

  function openTaskTransfer(
    assignment: R26WorkspaceResponse['assignmentPreview'][number],
  ) {
    if (!assignment.taskId) {
      return;
    }
    setImpact(null);
    setMutationError(null);
    setEditor({
      ...createEmptyMemberEditor(),
      mode: 'TRANSFER',
      userId: assignment.suggestedOwner?.id ?? '',
      memberTypes: [],
      scope:
        assignment.taskStatus === 'IN_PROGRESS'
          ? 'CONFIRM_IN_PROGRESS'
          : 'FUTURE_AND_PENDING',
      taskId: assignment.taskId,
      defaultNodeCodes: [assignment.nodeCode],
    });
  }

  async function previewChange(nextEditor: MemberEditorState) {
    setMutationPending(true);
    setMutationError(null);
    try {
      const memberChange = toMemberDraft(nextEditor);
      const response = await r26Gate3Request<R26AssignmentImpactResponse>(
        `/v2/projects/${encodeURIComponent(projectId)}/assignment-preview`,
        {
          method: 'POST',
          body: {
            scope: nextEditor.scope,
            ...(nextEditor.defaultNodeCodes.length
              ? { nodeCodes: nextEditor.defaultNodeCodes }
              : {}),
            ...(memberChange ? { memberChange } : {}),
            ...(nextEditor.mode === 'TRANSFER' &&
            nextEditor.taskId &&
            nextEditor.newOwnerUserId
              ? {
                  taskTransfer: {
                    taskId: nextEditor.taskId,
                    newOwnerUserId: nextEditor.newOwnerUserId,
                  },
                }
              : {}),
            confirmedInProgressTaskIds:
              nextEditor.confirmedInProgressTaskIds,
          },
        },
      );
      setImpact(response);
      setEditor(nextEditor);
    } catch (requestError) {
      setMutationError(
        requestError instanceof Error ? requestError.message : '影响预览失败。',
      );
    } finally {
      setMutationPending(false);
    }
  }

  async function confirmChange(nextEditor: MemberEditorState) {
    setMutationPending(true);
    setMutationError(null);
    try {
      const expectedVersion =
        workspace?.capabilities.memberAssignmentVersion;
      if (!expectedVersion) {
        throw new Error('成员与分工版本读取失败，请刷新页面后重试。');
      }
      let response: R26Gate3CommandResponse;
      if (nextEditor.mode === 'ADD' || nextEditor.mode === 'UPDATE') {
        const payload = {
          expectedVersion,
          idempotencyKey: createIdempotencyKey(
            nextEditor.mode.toLowerCase(),
          ),
          userId: nextEditor.userId,
          memberTypes: nextEditor.memberTypes,
          responsibility: nextEditor.responsibility || null,
          isDepartmentLead: nextEditor.isDepartmentLead,
          isDefaultExecutor: nextEditor.isDefaultExecutor,
          defaultNodeCodes: nextEditor.defaultNodeCodes,
          reason: nextEditor.reason || null,
        };
        const memberPath =
          nextEditor.mode === 'ADD'
            ? `/v2/projects/${encodeURIComponent(projectId)}/members`
            : `/v2/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(nextEditor.userId)}`;
        response = await r26Gate3Request<R26Gate3CommandResponse>(
          memberPath,
          {
            method: nextEditor.mode === 'ADD' ? 'POST' : 'PATCH',
            body: payload,
          },
        );
      } else if (nextEditor.mode === 'REMOVE') {
        response = await r26Gate3Request<R26Gate3CommandResponse>(
          `/v2/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(nextEditor.userId)}`,
          {
            method: 'DELETE',
            body: {
              expectedVersion,
              idempotencyKey: createIdempotencyKey('remove'),
              reason: nextEditor.reason,
              transferToUserId: nextEditor.transferToUserId || null,
              replacementOwnerUserId:
                nextEditor.replacementOwnerUserId || null,
              confirmedInProgressTaskIds:
                nextEditor.confirmedInProgressTaskIds,
            },
          },
        );
      } else if (nextEditor.mode === 'TRANSFER') {
        response = await r26Gate3Request<R26Gate3CommandResponse>(
          `/v2/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(nextEditor.taskId ?? '')}/assignment`,
          {
            method: 'PATCH',
            body: {
              expectedVersion,
              idempotencyKey: createIdempotencyKey('transfer'),
              newOwnerUserId: nextEditor.newOwnerUserId,
              confirmInProgress:
                nextEditor.scope === 'CONFIRM_IN_PROGRESS',
              reason: nextEditor.reason || null,
            },
          },
        );
      } else {
        response = await r26Gate3Request<R26Gate3CommandResponse>(
          `/v2/projects/${encodeURIComponent(projectId)}/assignments/apply`,
          {
            method: 'POST',
            body: {
              expectedVersion,
              idempotencyKey: createIdempotencyKey('apply'),
              scope: nextEditor.scope,
              ...(nextEditor.defaultNodeCodes.length
                ? { nodeCodes: nextEditor.defaultNodeCodes }
                : {}),
              confirmedInProgressTaskIds:
                nextEditor.confirmedInProgressTaskIds,
              reason: nextEditor.reason || null,
            },
          },
        );
      }
      setLiveData(response.workspace);
      setEditor(null);
      setImpact(null);
      showToast(commandSuccessMessage(nextEditor.mode));
    } catch (requestError) {
      setMutationError(
        requestError instanceof Error ? requestError.message : '操作失败。',
      );
    } finally {
      setMutationPending(false);
    }
  }

  return (
    <div
      className="r26-page r26-workspace-page"
      data-testid="r26-workspace"
      data-source="database"
    >
      <div className="r26-readonly-banner r26-gate3a-banner" role="status">
        <strong>Gate 3A · 成员与任务分配</strong>
        <span>仅开放项目成员和负责人调整；进展、材料与流程动作仍保持关闭。</span>
      </div>
      <header className="r26-project-header">
        <div className="r26-project-header__identity">
          <Link href="/v2/projects" aria-label="返回项目列表">项目列表</Link>
          <span aria-hidden="true">/</span>
          <div>
            <span className="r26-color-swatch r26-real-color" aria-hidden="true" />
            <div>
              <h1>{workspace.flowMap.colorName ?? workspace.project.name}</h1>
              <p>{workspace.project.name}</p>
            </div>
          </div>
        </div>
        <dl className="r26-project-header__facts">
          <div><dt>当前工序</dt><dd>{workspace.flowMap.currentStepName}</dd></div>
          <div><dt>负责人</dt><dd>{workspace.flowMap.currentOwner ?? '尚未分配'} · {workspace.flowMap.currentDepartment ?? '部门待定'}</dd></div>
          <div><dt>流程进度</dt><dd>{workspace.flowMap.progressText}</dd></div>
          <div><dt>最近更新</dt><dd>{formatDateTime(workspace.flowMap.lastUpdatedAt)}</dd></div>
        </dl>
      </header>

      <nav className="r26-project-tabs" aria-label="项目上下文">
        <button type="button" className={activeTab === 'flow' ? 'is-active' : ''} aria-current={activeTab === 'flow' ? 'page' : undefined} onClick={() => setActiveTab('flow')}>流程进度</button>
        <button type="button" className={activeTab === 'members' ? 'is-active' : ''} aria-current={activeTab === 'members' ? 'page' : undefined} onClick={() => setActiveTab('members')}>项目成员与分工</button>
        <button type="button" className={activeTab === 'records' ? 'is-active' : ''} aria-current={activeTab === 'records' ? 'page' : undefined} onClick={() => setActiveTab('records')}>项目记录</button>
      </nav>

      {activeTab === 'flow' ? (
        <div id="flow-map" className={`r26-workspace-layout ${selectedNode ? 'has-detail' : ''}`}>
          <R26FlowMap
            selectedNode={selectedNode}
            onSelectNode={selectNode}
            nodes={nodes}
            createdTaskIds={nodes.flatMap((node) => node.taskId ? [node.taskId] : [])}
            currentSummary={{
              currentStep: workspace.flowMap.currentStepName,
              attention,
            }}
            ignorePrototypeOverrides
            ariaLabel={`${workspace.flowMap.colorName ?? workspace.project.name}项目固定流程地图`}
          />
          {selectedNode ? (
            <RealTaskDetail
              node={selectedNode}
              rawNode={workspace.flowMap.nodes.find((node) => node.nodeCode === selectedNode.code) ?? null}
              task={taskQuery.data?.task ?? null}
              loading={taskQuery.loading}
              error={taskQuery.error}
              onClose={closeDetail}
            />
          ) : null}
        </div>
      ) : null}

      {activeTab === 'members' ? (
        <>
          <section className="r26-card r26-real-section" data-testid="r26-member-assignments">
            <div className="r26-section-heading r26-member-heading">
              <div>
                <p className="r26-eyebrow">真实项目组织</p>
                <h2>项目成员与分工</h2>
                <span>{workspace.memberAssignments.length} 位成员 · 版本 {workspace.capabilities.memberAssignmentVersion}</span>
              </div>
              {workspace.capabilities.manageMembers ? (
                <button type="button" className="r26-button r26-button--primary" onClick={openAddMember}>添加成员</button>
              ) : <StatusPill tone="neutral">只读</StatusPill>}
            </div>
            <div className="r26-member-grid">
              {workspace.memberAssignments.map((member) => (
                <article key={member.userId} className="r26-member-card">
                  <header>
                    <span>{member.name.slice(0, 1)}</span>
                    <div>
                      <h3>{member.name}</h3>
                      <p>{member.departmentName ?? '未设置部门'} · {member.roles.map((role) => role.label).join('、')}</p>
                    </div>
                    {member.isPrimary ? <StatusPill tone="current">主责</StatusPill> : null}
                  </header>
                  <dl>
                    <div><dt>项目职责</dt><dd>{member.projectResponsibility}</dd></div>
                    <div><dt>默认负责工序</dt><dd>{joinSteps(member.defaultNodes)}</dd></div>
                    <div><dt>当前任务</dt><dd>{member.currentTasks.map((task) => task.stepName).join('、') || '暂无'}</dd></div>
                    <div><dt>协同 / 评审</dt><dd>{member.relations.map((relation) => `${relation.stepName}（${relation.relation}）`).join('、') || '暂无'}</dd></div>
                  </dl>
                  {workspace.capabilities.manageMembers ? (
                    <footer className="r26-member-card__actions">
                      <button type="button" onClick={() => openEditMember(member)}>修改职责</button>
                      <button type="button" className="is-danger" onClick={() => openRemoveMember(member)}>移出项目</button>
                    </footer>
                  ) : null}
                </article>
              ))}
            </div>
            <div className="r26-organization-summary">
              {workspace.organization.departments.map((department) => (
                <span key={department.id}>{department.name} · {department.activeUserCount} 人</span>
              ))}
            </div>
          </section>

          <section className="r26-card r26-real-section" data-testid="r26-assignment-preview">
            <div className="r26-section-heading r26-member-heading">
              <div>
                <p className="r26-eyebrow">服务端分配规则</p>
                <h2>自动分配预览</h2>
                <span>负责人和可执行动作均由服务端返回</span>
              </div>
              {workspace.capabilities.manageMembers ? (
                <button type="button" className="r26-button r26-button--secondary" onClick={openAssignmentApply}>查看并应用分配</button>
              ) : null}
            </div>
            <div className="r26-assignment-table" role="table" aria-label="18 个工序自动分配预览">
              <div className="r26-assignment-table__header" role="row">
                <span>步骤 / 工序</span>
                <span>主责部门</span>
                <span>当前 / 建议负责人</span>
                <span>协同 / 评审</span>
                <span>匹配状态</span>
              </div>
              {workspace.assignmentPreview.map((assignment) => (
                <div className="r26-assignment-table__row" role="row" key={assignment.nodeCode}>
                  <div>
                    <small>第 {String(assignment.stepNumber).padStart(2, '0')} 步</small>
                    <strong>{assignment.stepName}</strong>
                  </div>
                  <span>{assignment.primaryDepartment?.name ?? '部门规则未命中'}</span>
                  <span>{assignment.suggestedOwner?.name ?? '尚未分配'}</span>
                  <span>{uniquePersonNames([...assignment.collaborators, ...assignment.reviewers]) || '无'}</span>
                  <div>
                    <StatusPill tone={assignment.assignmentStatus === 'UNASSIGNED' ? 'risk' : assignment.assignmentStatus === 'ASSIGNED' ? 'completed' : 'current'}>
                      {assignmentStatusLabel(assignment.assignmentStatus)}
                    </StatusPill>
                    <small>{assignment.unassignedReason ?? assignmentSourceLabel(assignment.assignmentSource)}</small>
                    {workspace.capabilities.manageMembers && assignment.taskId && assignment.availableActions.some((action) => action.action.includes('REASSIGN') || action.action.includes('CONFIRM')) ? (
                      <button type="button" className="r26-inline-action" onClick={() => openTaskTransfer(assignment)}>转交任务</button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {activeTab === 'records' ? (
        <section className="r26-card r26-workspace-activity r26-project-records" data-testid="r26-project-records">
          <div className="r26-section-heading">
            <div>
              <p className="r26-eyebrow">审计与项目事实</p>
              <h2>项目记录</h2>
            </div>
            <span>{workspace.projectRecords.length} 条最近记录</span>
          </div>
          <ol>
            {workspace.projectRecords.map((record) => (
              <li key={record.id}>
                <time>{formatDateTime(record.createdAt)}</time>
                <div>
                  <strong>{record.summary}</strong>
                  {record.reason ? <p>原因：{record.reason}</p> : null}
                </div>
                <span>{record.actorName} · {record.action}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {editor ? (
        <MemberAssignmentDrawer
          editor={editor}
          workspace={workspace}
          impact={impact}
          pending={mutationPending}
          error={mutationError}
          onChange={(next) => {
            setEditor(next);
            setImpact(null);
            setMutationError(null);
          }}
          onPreview={previewChange}
          onConfirm={confirmChange}
          onClose={() => {
            setEditor(null);
            setImpact(null);
            setMutationError(null);
          }}
        />
      ) : null}
      {toast ? <div className="r26-toast" role="status">{toast}</div> : null}
    </div>
  );
}

type MemberEditorMode =
  | 'ADD'
  | 'UPDATE'
  | 'REMOVE'
  | 'APPLY'
  | 'TRANSFER';

type MemberEditorState = {
  mode: MemberEditorMode;
  userId: string;
  memberTypes: string[];
  responsibility: string;
  isDepartmentLead: boolean;
  isDefaultExecutor: boolean;
  defaultNodeCodes: string[];
  scope: R26AssignmentScope;
  transferToUserId: string;
  replacementOwnerUserId: string;
  confirmedInProgressTaskIds: string[];
  taskId: string | null;
  newOwnerUserId: string;
  reason: string;
};

const MEMBER_ROLE_OPTIONS = [
  { value: 'OWNER', label: '项目负责人' },
  { value: 'MANAGER', label: '部门项目负责人' },
  { value: 'MEMBER', label: '项目成员 / 执行人' },
  { value: 'REVIEWER', label: '评审人' },
  { value: 'OBSERVER', label: '观察人' },
] as const;

function createEmptyMemberEditor(): MemberEditorState {
  return {
    mode: 'ADD',
    userId: '',
    memberTypes: ['MEMBER'],
    responsibility: '',
    isDepartmentLead: false,
    isDefaultExecutor: false,
    defaultNodeCodes: [],
    scope: 'FUTURE_AND_PENDING',
    transferToUserId: '',
    replacementOwnerUserId: '',
    confirmedInProgressTaskIds: [],
    taskId: null,
    newOwnerUserId: '',
    reason: '',
  };
}

function MemberAssignmentDrawer({
  editor,
  workspace,
  impact,
  pending,
  error,
  onChange,
  onPreview,
  onConfirm,
  onClose,
}: {
  editor: MemberEditorState;
  workspace: R26WorkspaceResponse;
  impact: R26AssignmentImpactResponse | null;
  pending: boolean;
  error: string | null;
  onChange: (editor: MemberEditorState) => void;
  onPreview: (editor: MemberEditorState) => Promise<void>;
  onConfirm: (editor: MemberEditorState) => Promise<void>;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const candidates = workspace.organization.users.filter((user) => {
    if (
      editor.mode === 'ADD' &&
      user.isProjectMember &&
      user.id !== editor.userId
    ) {
      return false;
    }
    if (departmentId && user.departmentId !== departmentId) {
      return false;
    }
    return (
      !search.trim() ||
      `${user.name} ${user.departmentName ?? ''}`
        .toLowerCase()
        .includes(search.trim().toLowerCase())
    );
  });
  const selectedMember = workspace.memberAssignments.find(
    (member) => member.userId === editor.userId,
  );
  const isOwner = selectedMember?.roles.some(
    (role) => role.memberType === 'OWNER',
  );
  const requiresMemberForm =
    editor.mode === 'ADD' || editor.mode === 'UPDATE';
  const requiresTransfer = editor.mode === 'TRANSFER';
  const canPreview =
    !pending &&
    (requiresMemberForm
      ? Boolean(editor.userId && editor.memberTypes.length)
      : requiresTransfer
        ? Boolean(editor.taskId && editor.newOwnerUserId)
        : editor.mode === 'REMOVE'
          ? Boolean(editor.userId)
          : true);
  const confirmDisabled =
    pending ||
    !impact ||
    (editor.mode === 'APPLY' && !impact.canApply) ||
    (editor.mode === 'REMOVE' && !editor.reason.trim()) ||
    (editor.mode === 'TRANSFER' &&
      (!editor.newOwnerUserId ||
        (editor.scope === 'CONFIRM_IN_PROGRESS' &&
          !editor.reason.trim())));

  function update(patch: Partial<MemberEditorState>) {
    onChange({ ...editor, ...patch });
  }

  return (
    <div
      className="r26-gate3-drawer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !pending) {
          onClose();
        }
      }}
    >
      <aside
        className="r26-gate3-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="r26-gate3-drawer-title"
        data-testid="r26-gate3-member-drawer"
      >
        <header>
          <div>
            <p className="r26-eyebrow">先预览影响，再确认写入</p>
            <h2 id="r26-gate3-drawer-title">{drawerTitle(editor.mode)}</h2>
          </div>
          <button type="button" aria-label="关闭成员与分工面板" onClick={onClose} disabled={pending}><CloseIcon /></button>
        </header>

        <div className="r26-gate3-drawer__body">
          {requiresMemberForm ? (
            <>
              {editor.mode === 'ADD' ? (
                <section className="r26-gate3-form-section">
                  <h3>选择公司有效用户</h3>
                  <div className="r26-directory-filters">
                    <label>
                      <span>搜索姓名或部门</span>
                      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="输入姓名或部门" />
                    </label>
                    <label>
                      <span>部门</span>
                      <select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
                        <option value="">全部部门</option>
                        {workspace.organization.departments.map((department) => (
                          <option key={department.id} value={department.id}>{department.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="r26-directory-results">
                    {candidates.map((user) => (
                      <label key={user.id} className={editor.userId === user.id ? 'is-selected' : ''}>
                        <input type="radio" name="project-user" checked={editor.userId === user.id} onChange={() => update({ userId: user.id })} />
                        <span>{user.name.slice(0, 1)}</span>
                        <div><strong>{user.name}</strong><small>{user.departmentName ?? '未设置部门'} · {user.isProjectMember ? '已是项目成员' : '可添加'}</small></div>
                      </label>
                    ))}
                    {candidates.length === 0 ? <p>没有符合条件且尚未加入项目的有效用户。</p> : null}
                  </div>
                </section>
              ) : (
                <section className="r26-selected-member">
                  <span>{selectedMember?.name.slice(0, 1)}</span>
                  <div><strong>{selectedMember?.name}</strong><small>{selectedMember?.departmentName ?? '未设置部门'}</small></div>
                </section>
              )}

              <section className="r26-gate3-form-section">
                <h3>项目职责</h3>
                <div className="r26-role-options">
                  {MEMBER_ROLE_OPTIONS.map((role) => (
                    <label key={role.value}>
                      <input
                        type="checkbox"
                        checked={editor.memberTypes.includes(role.value)}
                        onChange={() => update({
                          memberTypes: toggleValue(editor.memberTypes, role.value),
                        })}
                      />
                      <span>{role.label}</span>
                    </label>
                  ))}
                </div>
                <label className="r26-gate3-field">
                  <span>项目职责说明</span>
                  <input value={editor.responsibility} onChange={(event) => update({ responsibility: event.target.value })} placeholder="例如：采购材料协调与到货确认" />
                </label>
                {editor.memberTypes.includes('MANAGER') ? (
                  <label className="r26-switch-row">
                    <input type="checkbox" checked={editor.isDepartmentLead} onChange={(event) => update({ isDepartmentLead: event.target.checked })} />
                    <span><strong>设为该部门项目负责人</strong><small>优先承担本部门工序的负责人建议</small></span>
                  </label>
                ) : null}
                {editor.memberTypes.includes('MEMBER') ? (
                  <label className="r26-switch-row">
                    <input type="checkbox" checked={editor.isDefaultExecutor} onChange={(event) => update({ isDefaultExecutor: event.target.checked })} />
                    <span><strong>设为本部门默认执行人</strong><small>仅作为服务端候选规则，不给部门全员建任务</small></span>
                  </label>
                ) : null}
              </section>

              {editor.memberTypes.includes('MEMBER') ? (
                <NodeSelection
                  title="默认负责工序"
                  selected={editor.defaultNodeCodes}
                  assignments={workspace.assignmentPreview}
                  onChange={(defaultNodeCodes) => update({ defaultNodeCodes })}
                />
              ) : null}
            </>
          ) : null}

          {editor.mode === 'REMOVE' ? (
            <section className="r26-gate3-form-section">
              <div className="r26-selected-member">
                <span>{selectedMember?.name.slice(0, 1)}</span>
                <div><strong>{selectedMember?.name}</strong><small>{selectedMember?.currentTasks.length ?? 0} 个当前任务</small></div>
              </div>
              {(selectedMember?.currentTasks.length ?? 0) > 0 ? (
                <label className="r26-gate3-field">
                  <span>活跃任务转交给</span>
                  <select value={editor.transferToUserId} onChange={(event) => update({ transferToUserId: event.target.value })}>
                    <option value="">请选择项目成员</option>
                    {workspace.memberAssignments.filter((member) => member.userId !== editor.userId).map((member) => (
                      <option key={member.userId} value={member.userId}>{member.name} · {member.departmentName ?? '未设置部门'}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              {isOwner ? (
                <label className="r26-gate3-field">
                  <span>新的项目负责人</span>
                  <select value={editor.replacementOwnerUserId} onChange={(event) => update({ replacementOwnerUserId: event.target.value })}>
                    <option value="">请选择新的项目负责人</option>
                    {workspace.memberAssignments.filter((member) => member.userId !== editor.userId).map((member) => (
                      <option key={member.userId} value={member.userId}>{member.name}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <ReasonField value={editor.reason} onChange={(reason) => update({ reason })} label="移出原因" />
            </section>
          ) : null}

          {requiresTransfer ? (
            <section className="r26-gate3-form-section">
              <h3>转交任务</h3>
              <label className="r26-gate3-field">
                <span>新的负责人</span>
                <select value={editor.newOwnerUserId} onChange={(event) => update({ newOwnerUserId: event.target.value })}>
                  <option value="">请选择项目成员</option>
                  {workspace.memberAssignments.filter((member) => member.userId !== editor.userId).map((member) => (
                    <option key={member.userId} value={member.userId}>{member.name} · {member.departmentName ?? '未设置部门'}</option>
                  ))}
                </select>
              </label>
              <ReasonField value={editor.reason} onChange={(reason) => update({ reason })} label="转交原因" />
            </section>
          ) : null}

          {editor.mode === 'APPLY' || editor.mode === 'TRANSFER' || editor.mode === 'REMOVE' ? (
            <ScopeSelection
              value={editor.scope}
              onChange={(scope) => update({ scope })}
              lockToTask={editor.mode === 'TRANSFER'}
            />
          ) : null}

          {editor.mode === 'APPLY' ? (
            <NodeSelection
              title="应用工序范围"
              selected={editor.defaultNodeCodes}
              assignments={workspace.assignmentPreview}
              emptyMeansAll
              onChange={(defaultNodeCodes) => update({ defaultNodeCodes })}
            />
          ) : null}

          {impact ? (
            <ImpactPreview
              impact={impact}
              confirmedTaskIds={editor.confirmedInProgressTaskIds}
              onToggleConfirmed={(taskId) => {
                const nextEditor = {
                  ...editor,
                  confirmedInProgressTaskIds: toggleValue(
                  editor.confirmedInProgressTaskIds,
                  taskId,
                  ),
                };
                void onPreview(nextEditor);
              }}
            />
          ) : (
            <div className="r26-impact-placeholder">
              <strong>尚未生成影响预览</strong>
              <p>系统会列出未来任务、未开始任务、进行中任务和受保护的历史记录。</p>
            </div>
          )}
          {error ? <div className="r26-gate3-error" role="alert">{error}</div> : null}
        </div>

        <footer className="r26-gate3-drawer__footer">
          <button type="button" className="r26-button r26-button--secondary" onClick={() => void onPreview(editor)} disabled={!canPreview}>
            {pending ? '正在处理…' : impact ? '重新预览影响' : '预览影响'}
          </button>
          <button type="button" className="r26-button r26-button--primary" onClick={() => void onConfirm(editor)} disabled={confirmDisabled}>
            {confirmButtonLabel(editor.mode)}
          </button>
        </footer>
      </aside>
    </div>
  );
}

function ScopeSelection({
  value,
  onChange,
  lockToTask,
}: {
  value: R26AssignmentScope;
  onChange: (value: R26AssignmentScope) => void;
  lockToTask?: boolean;
}) {
  const scopes: Array<{ value: R26AssignmentScope; label: string; hint: string }> = [
    { value: 'FUTURE_ONLY', label: '仅未来任务', hint: '不改当前已生成任务' },
    { value: 'FUTURE_AND_PENDING', label: '未来与未开始任务', hint: '默认安全范围' },
    { value: 'CONFIRM_IN_PROGRESS', label: '包含进行中任务', hint: '必须逐项确认并填写原因' },
  ];
  return (
    <section className="r26-gate3-form-section">
      <h3>更新范围</h3>
      <div className="r26-scope-options">
        {scopes.map((scope) => (
          <label key={scope.value} className={value === scope.value ? 'is-selected' : ''}>
            <input type="radio" name="assignment-scope" value={scope.value} checked={value === scope.value} disabled={lockToTask && scope.value === 'FUTURE_ONLY'} onChange={() => onChange(scope.value)} />
            <span><strong>{scope.label}</strong><small>{scope.hint}</small></span>
          </label>
        ))}
      </div>
    </section>
  );
}

function NodeSelection({
  title,
  selected,
  assignments,
  emptyMeansAll,
  onChange,
}: {
  title: string;
  selected: string[];
  assignments: R26WorkspaceResponse['assignmentPreview'];
  emptyMeansAll?: boolean;
  onChange: (nodeCodes: string[]) => void;
}) {
  return (
    <section className="r26-gate3-form-section">
      <h3>{title}</h3>
      {emptyMeansAll ? <p className="r26-form-hint">未选择时默认覆盖全部 18 个工序。</p> : null}
      <div className="r26-node-options">
        {assignments.map((assignment) => (
          <label key={assignment.nodeCode}>
            <input type="checkbox" checked={selected.includes(assignment.nodeCode)} onChange={() => onChange(toggleValue(selected, assignment.nodeCode))} />
            <span>{String(assignment.stepNumber).padStart(2, '0')} · {assignment.stepName}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

function ReasonField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label className="r26-gate3-field">
      <span>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} placeholder="请说明本次调整的业务原因" />
    </label>
  );
}

function ImpactPreview({
  impact,
  confirmedTaskIds,
  onToggleConfirmed,
}: {
  impact: R26AssignmentImpactResponse;
  confirmedTaskIds: string[];
  onToggleConfirmed: (taskId: string) => void;
}) {
  return (
    <section className="r26-impact-preview" data-testid="r26-assignment-impact-preview">
      <header>
        <div><span>影响预览</span><strong>{impact.summary.nodeCount} 个工序</strong></div>
        <div><span>未开始任务</span><strong>{impact.summary.pendingTaskCount}</strong></div>
        <div><span>需逐项确认</span><strong>{impact.summary.inProgressTaskCount}</strong></div>
        <div><span>冲突</span><strong>{impact.summary.blockedCount}</strong></div>
      </header>
      {impact.conflicts.length ? (
        <div className="r26-impact-conflicts">
          {impact.conflicts.map((conflict) => <p key={conflict}>{conflict}</p>)}
        </div>
      ) : <p className="r26-impact-ok">未发现会覆盖已完成任务或历史记录的冲突。</p>}
      <div className="r26-impact-list">
        {impact.items.map((item) => (
          <article key={item.nodeCode} className={item.blocked ? 'is-blocked' : ''}>
            <div><small>第 {String(item.stepNumber).padStart(2, '0')} 步</small><strong>{item.stepName}</strong></div>
            <p>{item.suggestedOwner?.name ?? '负责人待分配'} · {item.primaryDepartment?.name ?? '部门待定'}</p>
            <span>
              {item.completedOrHistoricalProtected
                ? '已完成 / 历史记录受保护'
                : item.applyToPendingTask
                  ? '将更新未开始任务'
                  : item.requiresInProgressConfirmation
                    ? '进行中任务需确认'
                    : '仅更新未来任务配置'}
            </span>
            {item.requiresInProgressConfirmation && item.taskId ? (
              <label>
                <input type="checkbox" checked={confirmedTaskIds.includes(item.taskId)} onChange={() => onToggleConfirmed(item.taskId!)} />
                <span>确认转交该进行中任务</span>
              </label>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function toMemberDraft(editor: MemberEditorState): R26MemberDraft | null {
  if (
    editor.mode !== 'ADD' &&
    editor.mode !== 'UPDATE' &&
    editor.mode !== 'REMOVE'
  ) {
    return null;
  }
  return {
    type: editor.mode,
    userId: editor.userId,
    ...(editor.mode === 'REMOVE'
      ? {
          transferToUserId: editor.transferToUserId || null,
          replacementOwnerUserId: editor.replacementOwnerUserId || null,
        }
      : {
          memberTypes: editor.memberTypes,
          responsibility: editor.responsibility || null,
          isDepartmentLead: editor.isDepartmentLead,
          isDefaultExecutor: editor.isDefaultExecutor,
          defaultNodeCodes: editor.defaultNodeCodes,
        }),
  };
}

function toggleValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function drawerTitle(mode: MemberEditorMode) {
  const labels: Record<MemberEditorMode, string> = {
    ADD: '添加项目成员',
    UPDATE: '修改成员职责',
    REMOVE: '安全移出项目成员',
    APPLY: '应用任务分配',
    TRANSFER: '转交任务',
  };
  return labels[mode];
}

function confirmButtonLabel(mode: MemberEditorMode) {
  const labels: Record<MemberEditorMode, string> = {
    ADD: '确认添加',
    UPDATE: '确认更新',
    REMOVE: '确认移出',
    APPLY: '确认应用分配',
    TRANSFER: '确认转交',
  };
  return labels[mode];
}

function commandSuccessMessage(mode: MemberEditorMode) {
  const labels: Record<MemberEditorMode, string> = {
    ADD: '项目成员已添加，审计记录已保存。',
    UPDATE: '成员职责已更新，审计记录已保存。',
    REMOVE: '成员已安全移出，相关活跃任务已按确认转交。',
    APPLY: '未来与未开始任务分配已应用。',
    TRANSFER: '任务负责人已更新。',
  };
  return labels[mode];
}

function RealTaskDetail({
  node,
  rawNode,
  task,
  loading,
  error,
  onClose,
}: {
  node: R26FlowNode;
  rawNode: R26FlowMapNode | null;
  task: R26TaskDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <aside className="r26-task-detail" aria-label={`${node.name}工序详情`} data-testid="r26-task-detail">
      <header className="r26-task-detail__header">
        <div>
          <p>
            第 {String(node.step).padStart(2, '0')} 步 · {node.taskId ? `第 ${node.round || 1} 轮` : '尚未生成'}
          </p>
          <h2>{node.name}</h2>
          <StatusPill tone={statusTone(node.status)}>{STATUS_LABELS[node.status]}</StatusPill>
        </div>
        <button type="button" aria-label="关闭工序详情" onClick={onClose}><CloseIcon /></button>
      </header>
      <div className="r26-task-detail__body">
        <section className="r26-task-conclusion">
          <span>当前结论</span>
          <strong>{taskConclusion(node, task)}</strong>
          <p>{task?.relations.nextNodeName ? `下一步：${task.relations.nextNodeName}` : '下一步由流程状态与人工授权共同决定。'}</p>
        </section>
        {loading ? <p className="r26-inline-state">正在读取工序详情…</p> : null}
        {error ? <p className="r26-inline-state is-error">{error}</p> : null}

        <DetailSection title="责任信息">
          <DetailGrid items={[
            [
              '负责人',
              task?.owner?.name ??
                (rawNode?.taskId ? rawNode.suggestedOwner?.name : null) ??
                '负责人待分配',
            ],
            ['主责部门', task?.department.name ?? rawNode?.primaryDepartment?.name ?? '尚未匹配'],
            ['协同人', rawNode ? rawNode.collaborators.map((person) => person.name).join('、') || '无' : task?.collaborators.map((person) => person.name).join('、') || '无'],
            ['评审人', rawNode ? rawNode.reviewers.map((person) => person.name).join('、') || '无' : task?.approvers.map((person) => person.name).join('、') || '无'],
          ]} />
        </DetailSection>
        <DetailSection title="时间与进度">
          <DetailGrid items={[
            ['开始时间', formatDateTime(task?.schedule.startedAt ?? null)],
            ['截止时间', formatDateTime(task?.schedule.effectiveDueAt ?? rawNode?.dueAt ?? null)],
            ['SLA 状态', task?.schedule.slaStatus ?? (rawNode?.isOverdue ? '已逾期' : '待计算')],
            ['逾期天数', `${task?.schedule.overdueDays ?? rawNode?.overdueDays ?? 0} 天`],
          ]} />
        </DetailSection>
        <DetailSection title="工作要求与输出物">
          <p>{task?.workContent ?? '当前节点尚未创建任务，以下为自动分配预览。'}</p>
          <div className="r26-output-box"><span>预期输出</span><strong>{task?.outputName ?? '工序任务创建后确定'}</strong></div>
        </DetailSection>
        <DetailSection title="材料完整性">
          <div className="r26-material-summary">
            <strong>{task?.attachments.length ?? rawNode?.materialProgress.submitted ?? 0} / {task?.requiredMaterials.length ?? rawNode?.materialProgress.required ?? 0}</strong>
            <span>{rawNode?.materialProgress.missing ? `仍缺 ${rawNode.materialProgress.missing} 项必交材料` : '当前无缺失项'}</span>
          </div>
          {task?.requiredMaterials.length ? (
            <ul className="r26-material-list">
              {task.requiredMaterials.map((material, index) => {
                const name = material.name ?? material.label ?? `材料 ${index + 1}`;
                const uploaded = task.attachments.some((attachment) =>
                  attachment.materialType === material.code || attachment.fileName.includes(name),
                );
                return (
                  <li key={`${name}-${index}`} className={uploaded ? 'is-complete' : 'is-missing'}>
                    <span aria-hidden="true">{uploaded ? '✓' : '!'}</span>
                    <div><strong>{name}</strong><small>{uploaded ? '已上传' : '缺失'}</small></div>
                  </li>
                );
              })}
            </ul>
          ) : <p>该工序未配置必交材料。</p>}
        </DetailSection>
        {node.step === 17 ? (
          <DetailSection title="月度评审">
            <DetailGrid items={[
              ['完成进度', task?.monthlyReviewSummary?.progressText ?? rawNode?.monthlyReview?.progressText ?? '尚未生成月度实例'],
              ['已完成', `${task?.monthlyReviewSummary?.completedPeriods ?? rawNode?.monthlyReview?.completedPeriods ?? 0} / ${task?.monthlyReviewSummary?.totalPeriods ?? rawNode?.monthlyReview?.totalPeriods ?? 12}`],
              ['逾期月份', `${task?.monthlyReviewSummary?.overduePeriods ?? rawNode?.monthlyReview?.overduePeriods ?? 0} 个`],
              ['记录原则', '每月独立实例'],
            ]} />
          </DetailSection>
        ) : null}
        {node.step === 18 ? (
          <DetailSection title="颜色退出决定">
            <DetailGrid items={[
              ['年产量', task?.colorExitSummary?.annualOutput == null ? '待统计' : `${task.colorExitSummary.annualOutput} 台`],
              ['退出阈值', task?.colorExitSummary?.exitThreshold == null ? '待配置' : `${task.colorExitSummary.exitThreshold} 台`],
              ['系统建议', task?.colorExitSummary?.systemSuggestionLabel ?? exitLabel(rawNode?.colorExit?.systemSuggestion) ?? '暂无建议'],
              ['人工决定', task?.colorExitSummary?.finalDecisionLabel ?? exitLabel(rawNode?.colorExit?.finalDecision) ?? '待授权人员决定'],
            ]} />
            <p>系统建议只提供参考，不能代替授权人员的人工决定。</p>
          </DetailSection>
        ) : null}
        <DetailSection title="最近流转与审计">
          {task?.flowLogs.length ? (
            <ol className="r26-detail-events">
              {task.flowLogs.slice(0, 8).map((event, index) => (
                <li key={event.id ?? `${event.createdAt}-${index}`}>
                  <time>{formatDateTime(event.createdAt ?? null)}</time>
                  <p>{event.summary ?? event.actionLabel ?? '流程记录'}</p>
                </li>
              ))}
            </ol>
          ) : <p>当前没有流转记录。</p>}
        </DetailSection>
      </div>
      <footer className="r26-task-detail__footer">
        <div className="r26-readonly-footer">
          <strong>只读查看</strong>
          <span>{rawNode?.availableActions.length ? `后端可用动作：${rawNode.availableActions.map((action) => action.label).join('、')}` : '当前无可执行动作'}</span>
        </div>
      </footer>
    </aside>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="r26-detail-section"><h3>{title}</h3>{children}</section>;
}

function DetailGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="r26-detail-grid">
      {items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  );
}

function toDisplayNode(node: R26FlowMapNode): R26FlowNode {
  const geometry = R26_REAL_FLOW_GEOMETRY[node.nodeCode] ?? {
    x: 625,
    y: 80 + (node.stepNumber - 1) * 110,
    width: 190,
    height: 92,
    shape: 'rounded' as const,
  };
  const status = isNodeStatus(node.status) ? node.status : 'NOT_STARTED';

  const hasTask = node.taskId !== null;

  return {
    step: node.stepNumber,
    code: node.nodeCode,
    name: node.stepName,
    ...(geometry.shortName ? { shortName: geometry.shortName } : {}),
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
    shape: geometry.shape,
    status,
    owner: hasTask ? node.ownerName ?? '负责人待分配' : '负责人待分配',
    department: node.departmentName ?? node.primaryDepartment?.name ?? '部门待定',
    deadline: !hasTask
      ? '尚未生成'
      : node.isOverdue
      ? `逾期 ${node.overdueDays} 天`
      : node.dueAt
        ? formatDateTime(node.dueAt)
        : '等待前置工序',
    taskId: node.taskId,
    round: node.roundNo || 1,
    monthlyCompleted: node.monthlyReview?.completedPeriods ?? 0,
    monthlyTotal: node.monthlyReview?.totalPeriods ?? 12,
    collaborators: node.collaborators.map((person) => person.name),
    approver: node.reviewers.map((person) => person.name).join('、') || '无',
    startedAt: '任务详情中查看',
    remainingDays: null,
    overdueDays: node.overdueDays,
    requirement: '工序详情由真实任务接口提供。',
    output: '工序输出物',
    requiredMaterials: Array.from({ length: node.materialProgress.required }, (_, index) => `必交材料 ${index + 1}`),
    uploadedMaterials: Array.from({ length: node.materialProgress.submitted }, (_, index) => `已上传材料 ${index + 1}`),
    missingMaterials: Array.from({ length: node.materialProgress.missing }, (_, index) => `缺失材料 ${index + 1}`),
    recentEvents: [],
  };
}

function isNodeStatus(value: string): value is R26NodeStatus {
  return value in STATUS_LABELS;
}

function statusTone(status: R26NodeStatus) {
  if (status === 'COMPLETED' || status === 'COMPLETED_LATE') return 'completed';
  if (status === 'OVERDUE' || status === 'RETURNED') return 'risk';
  if (status === 'PENDING_REVIEW') return 'review';
  if (status === 'MONTHLY_TRACKING') return 'tracking';
  if (status === 'EXIT_PENDING') return 'exit';
  if (status === 'IN_PROGRESS') return 'current';
  return 'neutral';
}

function taskConclusion(node: R26FlowNode, task: R26TaskDetail | null) {
  if (!node.taskId) {
    return '该工序尚未生成，负责人保持待分配。';
  }
  if (task?.colorExitSummary) {
    return task.colorExitSummary.finalDecisionLabel
      ? `人工决定：${task.colorExitSummary.finalDecisionLabel}`
      : `系统建议：${task.colorExitSummary.systemSuggestionLabel ?? '暂无'}；仍需人工决定。`;
  }
  if (task?.monthlyReviewSummary) {
    return `${task.monthlyReviewSummary.progressText}，历史月份独立保留。`;
  }
  if (task?.reviewDetail.latestResultLabel) {
    return `最近评审结论：${task.reviewDetail.latestResultLabel}。`;
  }
  if (node.missingMaterials.length > 0) {
    return `${STATUS_LABELS[node.status]}，仍缺 ${node.missingMaterials.length} 项必交材料。`;
  }
  return `${STATUS_LABELS[node.status]}，当前材料记录无缺失项。`;
}

function formatDateTime(value: string | null) {
  if (!value) return '待确定';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function joinSteps(steps: Array<{ stepNumber: number; stepName: string }>) {
  return steps.length
    ? steps.map((step) => `${String(step.stepNumber).padStart(2, '0')} · ${step.stepName}`).join('、')
    : '暂无默认工序';
}

function assignmentStatusLabel(status: string) {
  return status === 'ASSIGNED' ? '已分配' : status === 'SUGGESTED' ? '建议匹配' : '未分配';
}

function assignmentSourceLabel(source: string) {
  const labels: Record<string, string> = {
    TASK_OVERRIDE: '来自当前真实工序任务',
    PROJECT_NODE_OVERRIDE: '来自项目工序专属配置',
    PROJECT_DEPARTMENT_LEAD: '来自项目部门负责人',
    PROJECT_DEFAULT_ASSIGNEE: '来自项目默认工序执行人',
    SINGLE_ELIGIBLE_MEMBER: '来自项目内唯一符合条件成员',
    UNASSIGNED: '没有可确定的项目负责人',
  };
  return labels[source] ?? source;
}

function uniquePersonNames(people: Array<{ id: string; name: string }>) {
  return [...new Map(people.map((person) => [person.id, person.name])).values()].join('、');
}

function exitLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    EXIT: '建议退出',
    RETAIN: '建议保留',
    OBSERVE: '建议观察',
  };
  return value ? labels[value] ?? value : null;
}
