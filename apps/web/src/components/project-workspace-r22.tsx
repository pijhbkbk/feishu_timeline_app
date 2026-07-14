'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { formatBusinessCode } from '../lib/business-code';
import {
  fetchProjectFlowMap,
  formatDate,
  formatDateTime,
  type ProjectFlowMapNode,
  type ProjectFlowMapResponse,
} from '../lib/projects-client';
import {
  fetchWorkflowTaskInteractionDetail,
  type WorkflowTaskInteractionDetail,
} from '../lib/workflows-client';
import { R22Card, R22ProgressBar, R22StatusBadge, type R22Tone } from './r22-ui';

export function ProjectWorkspaceR22({ projectId }: { projectId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);
  const [payload, setPayload] = useState<ProjectFlowMapResponse | null>(null);
  const [selectedNode, setSelectedNode] = useState<ProjectFlowMapNode | null>(null);
  const [detail, setDetail] = useState<WorkflowTaskInteractionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    void loadWorkspace({ initial: true });
    const timer = window.setInterval(() => void loadWorkspace({ silent: true }), 30_000);
    return () => window.clearInterval(timer);
  }, [projectId]);

  useEffect(() => {
    if (!payload) return;
    const taskIdFromUrl = searchParams.get('taskId');
    const preferred =
      payload.nodes.find((node) => node.taskId === taskIdFromUrl) ??
      payload.nodes.find((node) =>
        ['IN_PROGRESS', 'PENDING', 'PENDING_REVIEW', 'OVERDUE', 'RETURNED', 'MONTHLY_TRACKING'].includes(node.status),
      ) ??
      payload.nodes.find((node) => node.nodeCode === payload.currentStepCode) ??
      payload.nodes.find((node) => node.taskId) ??
      payload.nodes[0] ??
      null;
    setSelectedNode(preferred);
  }, [payload, searchParams]);

  useEffect(() => {
    if (!selectedNode?.taskId) {
      setDetail(null);
      return;
    }
    void loadTaskDetail(selectedNode.taskId);
  }, [selectedNode?.taskId]);

  async function loadWorkspace(options?: { initial?: boolean; silent?: boolean }) {
    const requestId = ++requestIdRef.current;
    if (options?.initial) setIsLoading(true);
    else if (!options?.silent) setIsRefreshing(true);
    if (!options?.silent) setError(null);

    try {
      const response = await fetchProjectFlowMap(projectId);
      if (requestId === requestIdRef.current) setPayload(response);
    } catch (loadError) {
      if (requestId === requestIdRef.current) {
        setError(loadError instanceof Error ? loadError.message : '项目工作区加载失败。');
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  async function loadTaskDetail(taskId: string) {
    const requestId = ++detailRequestIdRef.current;
    setIsLoadingDetail(true);
    setDetailError(null);
    try {
      const response = await fetchWorkflowTaskInteractionDetail(taskId);
      if (requestId === detailRequestIdRef.current) setDetail(response);
    } catch (loadError) {
      if (requestId === detailRequestIdRef.current) {
        setDetailError(loadError instanceof Error ? loadError.message : '工序详情加载失败。');
      }
    } finally {
      if (requestId === detailRequestIdRef.current) setIsLoadingDetail(false);
    }
  }

  function selectNode(node: ProjectFlowMapNode) {
    setSelectedNode(node);
    const params = new URLSearchParams(searchParams.toString());
    if (node.taskId) params.set('taskId', node.taskId);
    else params.delete('taskId');
    params.set('nodeCode', node.nodeCode);
    router.replace(`/projects/${projectId}?${params.toString()}`, { scroll: false });
  }

  const orderedNodes = useMemo(
    () => [...(payload?.nodes ?? [])].sort((left, right) => left.stepNumber - right.stepNumber),
    [payload],
  );

  if (isLoading && !payload) return <ProjectWorkspaceSkeleton />;

  if (!payload) {
    return (
      <R22Card className="r22-state-card">
        <R22StatusBadge tone="danger">加载失败</R22StatusBadge>
        <h1>无法打开项目工作区</h1>
        <p>{error ?? '请确认项目权限后重试。'}</p>
        <button type="button" className="r22-button r22-button-primary" onClick={() => void loadWorkspace({ initial: true })}>重新加载</button>
      </R22Card>
    );
  }

  return (
    <div className="r22-page r22-project-workspace" data-testid="project-workspace-page">
      <header className="r22-project-hero">
        <div>
          <p className="r22-breadcrumb"><Link href="/projects">项目管理</Link><span>/</span>{formatBusinessCode(payload.projectCode, '定制色项目')}</p>
          <div className="r22-project-title-row">
            <h1>{payload.projectName}</h1>
            <R22StatusBadge tone={payload.overdueCount > 0 ? 'danger' : 'success'}>
              {payload.overdueCount > 0 ? `${payload.overdueCount} 个节点逾期` : '推进正常'}
            </R22StatusBadge>
          </div>
          <p>{payload.colorName} · 当前工序：{payload.currentStepName}</p>
        </div>
        <div className="r22-project-hero-actions">
          <span>更新于 {formatDateTime(payload.lastUpdatedAt)}</span>
          <button type="button" className="r22-icon-button" disabled={isRefreshing} onClick={() => void loadWorkspace()} aria-label="刷新项目工作区">
            {isRefreshing ? '…' : '↻'}
          </button>
          <Link href={`/projects/${projectId}/overview`} className="r22-button r22-button-secondary">项目资料</Link>
        </div>
      </header>

      {error ? <div className="r22-inline-alert">刷新失败，当前展示上一次成功结果。</div> : null}

      <div className="r22-project-summary-bar">
        <div><span>整体进度</span><strong>{payload.progressPercent}%</strong></div>
        <R22ProgressBar value={payload.progressPercent} label="项目整体进度" />
        <dl>
          <div><dt>当前负责人</dt><dd>{payload.currentOwner ?? '待分配'}</dd></div>
          <div><dt>责任部门</dt><dd>{payload.currentDepartment ?? '待分配'}</dd></div>
          <div><dt>月度评审</dt><dd>{payload.monthlyReviewProgress.text}</dd></div>
        </dl>
      </div>

      <section className="r22-project-workspace-grid">
        <R22Card className="r22-process-card">
          <div className="r22-section-heading">
            <div>
              <p className="r22-overline">项目路径</p>
              <h2>开发流程</h2>
              <p>点击任一工序，在右侧查看当前事实和下一步。</p>
            </div>
            <div className="r22-process-legend">
              <span><i className="is-done" />已完成</span>
              <span><i className="is-current" />当前</span>
              <span><i className="is-risk" />风险</span>
            </div>
          </div>
          <div className="r22-process-map" role="list" aria-label="18 步开发流程">
            {orderedNodes.map((node, index) => (
              <button
                key={node.nodeCode}
                type="button"
                role="listitem"
                className={`r22-process-node r22-process-node-${getNodeTone(node)} ${selectedNode?.nodeCode === node.nodeCode ? 'is-selected' : ''}`}
                onClick={() => selectNode(node)}
                aria-pressed={selectedNode?.nodeCode === node.nodeCode}
                data-testid={`r22-process-node-${node.stepCode}`}
              >
                <span>{node.stepCode}</span>
                <strong>{node.stepName}</strong>
                <small>{node.ownerName ?? node.statusLabel}</small>
                {index < orderedNodes.length - 1 ? <i aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        </R22Card>

        <CurrentStagePanel
          node={selectedNode}
          detail={detail}
          isLoading={isLoadingDetail}
          error={detailError}
          projectId={projectId}
        />
      </section>
    </div>
  );
}

function CurrentStagePanel({
  node,
  detail,
  isLoading,
  error,
  projectId,
}: {
  node: ProjectFlowMapNode | null;
  detail: WorkflowTaskInteractionDetail | null;
  isLoading: boolean;
  error: string | null;
  projectId: string;
}) {
  if (!node) return null;
  const tone = getStatusTone(node);
  const taskId = node.taskId;
  const requiredCount = detail?.requiredMaterials.filter((item) => item.required).length ?? node.materialProgress.required;
  const submittedCount = detail?.attachments.length ?? node.materialProgress.submitted;

  return (
    <R22Card className="r22-current-stage-card">
      <div className="r22-current-stage-sticky">
        <div className="r22-current-stage-heading">
          <R22StatusBadge tone={tone}>{node.statusLabel}</R22StatusBadge>
          <span>第 {node.stepCode} 步</span>
        </div>
        <h2>{node.stepName}</h2>
        <p className="r22-current-stage-description">
          {detail?.workContent ?? (isLoading ? '正在同步工序要求…' : '该工序尚未生成可执行任务。')}
        </p>

        {error ? <div className="r22-inline-alert">{error}</div> : null}

        <dl className="r22-stage-facts">
          <div><dt>负责人</dt><dd>{detail?.owner?.name ?? node.ownerName ?? '待分配'}</dd></div>
          <div><dt>责任部门</dt><dd>{detail?.department.name ?? node.departmentName ?? '待分配'}</dd></div>
          <div><dt>截止时间</dt><dd className={node.isOverdue ? 'is-danger' : undefined}>{formatDate(detail?.deadline ?? node.dueAt)}</dd></div>
          <div><dt>当前轮次</dt><dd>第 {(detail?.roundNo ?? node.roundNo) || 1} 轮</dd></div>
        </dl>

        <div className="r22-stage-materials">
          <div>
            <span>必交材料</span>
            <strong>{submittedCount} / {requiredCount}</strong>
          </div>
          <R22ProgressBar value={requiredCount > 0 ? (submittedCount / requiredCount) * 100 : 100} label="材料提交进度" />
          {detail?.requiredMaterials.length ? (
            <ul>
              {detail.requiredMaterials.slice(0, 3).map((material) => {
                const isSubmitted = detail.attachments.some((attachment) => attachment.fileName.includes(material.name));
                return <li key={material.id} className={isSubmitted ? 'is-done' : ''}><span>{isSubmitted ? '✓' : '○'}</span>{material.name}</li>;
              })}
            </ul>
          ) : <p>{node.materialProgress.text}</p>}
          {requiredCount > submittedCount ? (
            <p className="is-danger" role="alert">
              缺少 {requiredCount - submittedCount} 项必交材料，完成工序前必须补齐。
            </p>
          ) : null}
        </div>

        <div className="r22-stage-next">
          <span>下一步</span>
          <strong>{detail?.relations.nextNodeName ?? '等待当前工序完成后由系统判定'}</strong>
        </div>

        <div className="r22-stage-actions">
          {taskId ? (
            <>
              <Link href={`/progress?taskId=${taskId}`} className="r22-button r22-button-primary">提交工作进展</Link>
              <Link href={`/progress?taskId=${taskId}&step=3`} className="r22-button r22-button-secondary">上传材料</Link>
            </>
          ) : (
            <Link href={`/projects/${projectId}/tasks`} className="r22-button r22-button-secondary">查看工序清单</Link>
          )}
        </div>
      </div>
    </R22Card>
  );
}

function ProjectWorkspaceSkeleton() {
  return (
    <div className="r22-page r22-skeleton-page">
      <div className="r22-skeleton r22-skeleton-title" />
      <div className="r22-project-workspace-grid">
        <div className="r22-skeleton r22-skeleton-map" />
        <div className="r22-skeleton r22-skeleton-panel" />
      </div>
    </div>
  );
}

function getNodeTone(node: ProjectFlowMapNode) {
  if (node.isOverdue || node.status === 'RETURNED') return 'risk';
  if (node.status === 'COMPLETED' || node.status === 'COMPLETED_LATE') return 'done';
  if (['IN_PROGRESS', 'PENDING', 'PENDING_REVIEW', 'MONTHLY_TRACKING'].includes(node.status)) return 'current';
  return 'pending';
}

function getStatusTone(node: ProjectFlowMapNode): R22Tone {
  const tone = getNodeTone(node);
  if (tone === 'risk') return 'danger';
  if (tone === 'done') return 'success';
  if (node.status === 'PENDING_REVIEW') return 'warning';
  if (node.status === 'MONTHLY_TRACKING') return 'monthly';
  if (tone === 'current') return 'brand';
  return 'neutral';
}
