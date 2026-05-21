'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from './auth-provider';
import { FeedbackBanner } from './feedback-banner';
import { StatePanel } from './state-panel';
import { TaskDetailDrawer } from './task-detail-drawer';
import {
  fetchProjectFlowMap,
  formatDate,
  formatDateTime,
  type FlowMapEdgeStatus,
  type FlowMapEdgeType,
  type FlowMapNodeStatus,
  type ProjectFlowMapEdge,
  type ProjectFlowMapNode,
  type ProjectFlowMapResponse,
  type WorkflowNodeCode,
} from '../lib/projects-client';
import {
  executeWorkflowAction,
  fetchWorkflowTaskInteractionDetail,
  type WorkflowAction,
  type WorkflowTaskInteractionDetail,
} from '../lib/workflows-client';
import { COLOR_EXIT_SUGGESTION_LABELS } from '../lib/status-labels';

type FlowMapWorkspaceProps = {
  projectId: string;
};

type ViewMode = 'all' | 'mainline' | 'risk' | 'mine' | 'open';

type NodeLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const FLOW_MAP_CANVAS = {
  width: 1440,
  height: 1740,
};

function createNodeLayout(centerX: number, y: number, width = 190, height = 92): NodeLayout {
  return {
    x: centerX - width / 2,
    y,
    width,
    height,
  };
}

const FLOW_MAP_NODE_LAYOUT: Record<WorkflowNodeCode, NodeLayout> = {
  PROJECT_INITIATION: createNodeLayout(720, 80),
  DEVELOPMENT_REPORT: createNodeLayout(720, 190),
  PAINT_DEVELOPMENT: createNodeLayout(720, 300),
  SAMPLE_COLOR_CONFIRMATION: createNodeLayout(720, 410),
  COLOR_NUMBERING: createNodeLayout(1040, 410),
  PAINT_PROCUREMENT: createNodeLayout(720, 540),
  PERFORMANCE_TEST: createNodeLayout(400, 540),
  STANDARD_BOARD_PRODUCTION: createNodeLayout(1040, 540),
  BOARD_DETAIL_UPDATE: createNodeLayout(1280, 540),
  FIRST_UNIT_PRODUCTION_PLAN: createNodeLayout(720, 670),
  TRIAL_PRODUCTION: createNodeLayout(720, 800),
  CAB_REVIEW: createNodeLayout(720, 940, 210, 130),
  DEVELOPMENT_ACCEPTANCE: createNodeLayout(400, 1040),
  COLOR_CONSISTENCY_REVIEW: createNodeLayout(720, 1120),
  MASS_PRODUCTION_PLAN: createNodeLayout(720, 1250),
  MASS_PRODUCTION: createNodeLayout(720, 1380),
  VISUAL_COLOR_DIFFERENCE_REVIEW: createNodeLayout(720, 1510, 230, 100),
  PROJECT_CLOSED: createNodeLayout(720, 1640, 190, 84),
};

const FLOW_MAP_PATHS: Record<string, string> = {
  'PROJECT_INITIATION->DEVELOPMENT_REPORT': 'M 720 172 L 720 190',
  'DEVELOPMENT_REPORT->PAINT_DEVELOPMENT': 'M 720 282 L 720 300',
  'PAINT_DEVELOPMENT->SAMPLE_COLOR_CONFIRMATION': 'M 720 392 L 720 410',
  'SAMPLE_COLOR_CONFIRMATION->COLOR_NUMBERING': 'M 815 456 L 945 456',
  'SAMPLE_COLOR_CONFIRMATION->PAINT_PROCUREMENT': 'M 720 502 L 720 540',
  'PAINT_PROCUREMENT->PERFORMANCE_TEST': 'M 625 586 L 495 586',
  'PAINT_PROCUREMENT->STANDARD_BOARD_PRODUCTION': 'M 815 586 L 945 586',
  'STANDARD_BOARD_PRODUCTION->BOARD_DETAIL_UPDATE': 'M 1135 586 L 1185 586',
  'PAINT_PROCUREMENT->FIRST_UNIT_PRODUCTION_PLAN': 'M 720 632 L 720 670',
  'FIRST_UNIT_PRODUCTION_PLAN->TRIAL_PRODUCTION': 'M 720 762 L 720 800',
  'TRIAL_PRODUCTION->CAB_REVIEW': 'M 720 892 L 720 940',
  'CAB_REVIEW->TRIAL_PRODUCTION': 'M 825 1005 L 940 1005 L 940 846 L 815 846',
  'CAB_REVIEW->DEVELOPMENT_ACCEPTANCE': 'M 615 1005 L 560 1005 L 560 1086 L 495 1086',
  'CAB_REVIEW->COLOR_CONSISTENCY_REVIEW': 'M 720 1070 L 720 1120',
  'COLOR_CONSISTENCY_REVIEW->MASS_PRODUCTION_PLAN': 'M 720 1212 L 720 1250',
  'MASS_PRODUCTION_PLAN->MASS_PRODUCTION': 'M 720 1342 L 720 1380',
  'MASS_PRODUCTION->VISUAL_COLOR_DIFFERENCE_REVIEW': 'M 720 1472 L 720 1510',
  'VISUAL_COLOR_DIFFERENCE_REVIEW->PROJECT_CLOSED': 'M 720 1610 L 720 1640',
};

export function FlowMapWorkspace({ projectId }: FlowMapWorkspaceProps) {
  const router = useRouter();
  const { user } = useAuth();
  const mapRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);
  const isActingRef = useRef(false);
  const [payload, setPayload] = useState<ProjectFlowMapResponse | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeCode, setSelectedNodeCode] = useState<WorkflowNodeCode | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<WorkflowTaskInteractionDetail | null>(null);
  const [isLoadingTaskDetail, setIsLoadingTaskDetail] = useState(false);
  const [taskDetailError, setTaskDetailError] = useState<string | null>(null);
  const [actingAction, setActingAction] = useState<WorkflowAction | null>(null);

  useEffect(() => {
    void loadFlowMap({ initial: true });
    syncSelectionFromUrl();
    const timer = window.setInterval(() => {
      if (!isActingRef.current) {
        void loadFlowMap({ silent: true });
      }
    }, 30_000);

    window.addEventListener('popstate', syncSelectionFromUrl);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('popstate', syncSelectionFromUrl);
    };
  }, [projectId]);

  useEffect(() => {
    if (!payload || !selectedTaskId) {
      return;
    }

    const matchingNode = payload.nodes.find((node) => node.taskId === selectedTaskId);

    if (matchingNode && matchingNode.nodeCode !== selectedNodeCode) {
      setSelectedNodeCode(matchingNode.nodeCode);
    }
  }, [payload, selectedNodeCode, selectedTaskId]);

  useEffect(() => {
    if (!selectedTaskId) {
      setSelectedTaskDetail(null);
      setTaskDetailError(null);
      setIsLoadingTaskDetail(false);
      return;
    }

    void loadSelectedTaskDetail(selectedTaskId);

    const timer = window.setInterval(() => {
      if (!isActingRef.current) {
        void loadSelectedTaskDetail(selectedTaskId, { silent: true });
      }
    }, 15_000);

    return () => window.clearInterval(timer);
  }, [selectedTaskId]);

  async function loadFlowMap(options?: { initial?: boolean; silent?: boolean }) {
    const requestId = ++mapRequestIdRef.current;

    if (options?.initial) {
      setIsLoading(true);
    } else if (!options?.silent) {
      setIsRefreshing(true);
    }

    if (!options?.silent) {
      setError(null);
    }

    try {
      const response = await fetchProjectFlowMap(projectId);

      if (requestId !== mapRequestIdRef.current) {
        return;
      }

      setPayload(response);
    } catch (loadError) {
      if (requestId !== mapRequestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : '项目实时流程地图加载失败。');
    } finally {
      if (requestId === mapRequestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  async function loadSelectedTaskDetail(
    taskId: string,
    options?: { silent?: boolean },
  ) {
    const requestId = ++detailRequestIdRef.current;

    if (!options?.silent) {
      setIsLoadingTaskDetail(true);
      setTaskDetailError(null);
    }

    try {
      const detail = await fetchWorkflowTaskInteractionDetail(taskId);

      if (requestId !== detailRequestIdRef.current) {
        return;
      }

      setSelectedTaskDetail(detail);
    } catch (loadError) {
      if (requestId !== detailRequestIdRef.current) {
        return;
      }

      setTaskDetailError(loadError instanceof Error ? loadError.message : '工序详情加载失败。');
    } finally {
      if (requestId === detailRequestIdRef.current) {
        setIsLoadingTaskDetail(false);
      }
    }
  }

  function syncSelectionFromUrl() {
    const params = new URLSearchParams(window.location.search);
    setSelectedTaskId(params.get('taskId'));
  }

  function handleSelectNode(node: ProjectFlowMapNode) {
    setSelectedNodeCode(node.nodeCode);
    setSelectedTaskId(node.taskId);

    const params = new URLSearchParams(window.location.search);

    if (node.taskId) {
      params.set('taskId', node.taskId);
    } else {
      params.delete('taskId');
      params.set('nodeCode', node.nodeCode);
    }

    router.replace(`${window.location.pathname}?${params.toString()}`, { scroll: false });
  }

  function handleCloseDrawer() {
    setSelectedNodeCode(null);
    setSelectedTaskId(null);
    const params = new URLSearchParams(window.location.search);
    params.delete('taskId');
    params.delete('nodeCode');
    const query = params.toString();
    router.replace(query ? `${window.location.pathname}?${query}` : window.location.pathname, {
      scroll: false,
    });
  }

  async function handleDrawerAction(action: WorkflowAction) {
    if (!selectedTaskId) {
      return;
    }

    isActingRef.current = true;
    setActingAction(action);
    setTaskDetailError(null);

    try {
      await executeWorkflowAction(selectedTaskId, action);
      await Promise.all([
        loadFlowMap({ silent: true }),
        loadSelectedTaskDetail(selectedTaskId, { silent: true }),
      ]);
    } catch (actionError) {
      setTaskDetailError(actionError instanceof Error ? actionError.message : '工序操作失败。');
    } finally {
      setActingAction(null);
      isActingRef.current = false;
    }
  }

  const selectedNode = useMemo(() => {
    if (!payload || !selectedNodeCode) {
      return null;
    }

    return payload.nodes.find((node) => node.nodeCode === selectedNodeCode) ?? null;
  }, [payload, selectedNodeCode]);

  const visibleNodeCodeSet = useMemo(() => {
    if (!payload) {
      return new Set<WorkflowNodeCode>();
    }

    return new Set(
      payload.nodes
        .filter((node) => isNodeVisibleInMode(node, viewMode, user?.name ?? null))
        .map((node) => node.nodeCode),
    );
  }, [payload, user?.name, viewMode]);

  if (error && !payload) {
    return (
      <section className="page-card flow-map-loading-card">
        <p className="eyebrow">项目实时流程地图</p>
        <h1>项目实时流程地图加载失败</h1>
        <p>{error}</p>
        <div className="inline-actions">
          <button type="button" className="button button-primary" onClick={() => void loadFlowMap()}>
            重新加载
          </button>
          <Link href="/login" className="button button-secondary">
            登录系统
          </Link>
          <Link href="/projects/flow-map" className="button button-secondary">
            返回流程地图入口
          </Link>
        </div>
      </section>
    );
  }

  if (isLoading || !payload) {
    return (
      <section className="page-card flow-map-loading-card">
        <p className="eyebrow">项目实时流程地图</p>
        <h1>正在加载项目实时流程地图…</h1>
        <p>正在同步 18 个节点、连线状态、月度评审进度和最近动态。</p>
      </section>
    );
  }

  return (
    <div className="page-stack flow-map-page" data-testid="flow-map-page">
      <section className="page-card flow-map-header-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">项目实时流程地图</p>
            <h2 className="section-title">{payload.projectName}</h2>
            <p className="muted">
              颜色：{payload.colorName}。流程地图每 30 秒自动刷新，工序抽屉每 15 秒刷新。
            </p>
            <p className="flow-map-last-updated">最近更新：{formatFlowMapDateTime(payload.lastUpdatedAt)}</p>
          </div>
          <div className="inline-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={isRefreshing}
              onClick={() => void loadFlowMap()}
            >
              {isRefreshing ? '刷新中…' : '立即刷新'}
            </button>
            <Link href={`/projects/${projectId}/tasks`} className="button button-secondary">
              工序清单
            </Link>
            <Link href={`/projects/${projectId}/materials`} className="button button-secondary">
              材料中心
            </Link>
            <Link href="/analytics" className="button button-primary">
              数据中心
            </Link>
          </div>
        </div>
        {error ? <FeedbackBanner variant="error" title="流程地图刷新失败" message={error} /> : null}
        <FlowMapStatusBar payload={payload} />
      </section>

      <FlowMapCanvas
        payload={payload}
        viewMode={viewMode}
        visibleCount={visibleNodeCodeSet.size}
        visibleNodeCodeSet={visibleNodeCodeSet}
        selectedNodeCode={selectedNodeCode}
        onViewModeChange={setViewMode}
        onSelectNode={handleSelectNode}
      />

      <section className="page-card flow-map-activity-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">最近动态</p>
            <h2 className="section-title">流转记录 / 最近动态</h2>
            <p className="muted">展示系统自动创建节点、人工流转和评审动作。</p>
          </div>
        </div>
        <ActivityTimeline payload={payload} />
      </section>

      <TaskDetailDrawer
        open={Boolean(selectedTaskId)}
        detail={selectedTaskDetail}
        isLoading={isLoadingTaskDetail}
        error={taskDetailError}
        actingAction={actingAction}
        onClose={handleCloseDrawer}
        onReload={() => selectedTaskId && void loadSelectedTaskDetail(selectedTaskId)}
        onExecuteAction={(action) => void handleDrawerAction(action)}
      />
      <FlowMapNodeSummaryDrawer
        open={Boolean(selectedNode && !selectedTaskId)}
        node={selectedNode}
        payload={payload}
        onClose={handleCloseDrawer}
      />
    </div>
  );
}

function FlowMapStatusBar({ payload }: { payload: ProjectFlowMapResponse }) {
  return (
    <div className="flow-map-status-bar" aria-label="项目实时流程地图状态栏">
      <FlowMapStatusItem label="当前节点" value={payload.currentStepName} />
      <FlowMapStatusItem label="进度" value={`${payload.progressPercent}%`} />
      <FlowMapStatusItem label="负责人" value={payload.currentOwner ?? '未分配'} />
      <FlowMapStatusItem label="责任部门" value={payload.currentDepartment ?? '未分配'} />
      <FlowMapStatusItem
        label="逾期节点"
        value={payload.overdueCount > 0 ? `${payload.overdueCount} 个` : '无'}
        danger={payload.overdueCount > 0}
      />
      <FlowMapStatusItem
        label="月度评审"
        value={`${payload.monthlyReviewProgress.completed} / ${payload.monthlyReviewProgress.total}`}
      />
      <FlowMapStatusItem
        label="最近更新"
        value={formatFlowMapDateTime(payload.lastUpdatedAt)}
      />
    </div>
  );
}

function FlowMapStatusItem({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className={danger ? 'flow-map-status-item flow-map-status-danger' : 'flow-map-status-item'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FlowMapLegendFilterPopover({
  payload,
  viewMode,
  visibleCount,
  onViewModeChange,
}: {
  payload: ProjectFlowMapResponse;
  viewMode: ViewMode;
  visibleCount: number;
  onViewModeChange: (mode: ViewMode) => void;
}) {
  return (
    <div className="flow-map-filter-popover" data-testid="flow-map-filter-popover">
      <div>
        <p className="eyebrow">筛选与图例</p>
        <h2 className="section-title">图例 / 筛选</h2>
        <p className="muted">
          当前显示 {visibleCount} / {payload.nodes.length} 个节点。筛选不会改变业务状态，只调整地图高亮。
        </p>
      </div>
      <div className="flow-map-filter-group" role="group" aria-label="流程地图视图模式">
        {[
          { value: 'all', label: '全部节点' },
          { value: 'mainline', label: '只看主线' },
          { value: 'risk', label: '只看风险节点' },
          { value: 'mine', label: '只看我的任务' },
          { value: 'open', label: '只看未完成' },
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            className={viewMode === item.value ? 'flow-map-filter-active' : undefined}
            onClick={() => onViewModeChange(item.value as ViewMode)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="flow-map-legend">
        {[
          ['done', '已完成'],
          ['current', '进行中'],
          ['review', '待评审'],
          ['overdue', '已逾期'],
          ['returned', '已退回'],
          ['monthly', '月度跟踪'],
          ['exit', '待退出'],
          ['not-started', '未开始'],
        ].map(([tone, label]) => (
          <span key={tone}>
            <i className={`flow-map-legend-dot flow-map-legend-${tone}`} />
            {label}
          </span>
        ))}
      </div>
      <div className="flow-map-side-summary">
        <strong>下一步</strong>
        <p>{payload.currentStepName === '未开始' ? '等待流程初始化' : `推进${payload.currentStepName}`}</p>
        <strong>第 17 步</strong>
        <p>{payload.monthlyReviewProgress.text}</p>
      </div>
    </div>
  );
}

function FlowMapCanvas({
  payload,
  viewMode,
  visibleCount,
  visibleNodeCodeSet,
  selectedNodeCode,
  onViewModeChange,
  onSelectNode,
}: {
  payload: ProjectFlowMapResponse;
  viewMode: ViewMode;
  visibleCount: number;
  visibleNodeCodeSet: Set<WorkflowNodeCode>;
  selectedNodeCode: WorkflowNodeCode | null;
  onViewModeChange: (mode: ViewMode) => void;
  onSelectNode: (node: ProjectFlowMapNode) => void;
}) {
  const scrollShellRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(0.68);
  const [manualScale, setManualScale] = useState(1);
  const [isFitMode, setIsFitMode] = useState(true);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const effectiveScale = isFitMode ? fitScale : manualScale;

  useEffect(() => {
    const shell = scrollShellRef.current;

    if (!shell) {
      return;
    }

    const updateFitScale = () => {
      const nextScale = Math.min(1, Math.max(0.22, (shell.clientWidth - 24) / FLOW_MAP_CANVAS.width));
      setFitScale(Number(nextScale.toFixed(3)));
    };

    updateFitScale();
    const observer = new ResizeObserver(updateFitScale);
    observer.observe(shell);

    return () => observer.disconnect();
  }, []);

  function scrollToStart() {
    window.requestAnimationFrame(() => {
      scrollShellRef.current?.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
    });
  }

  function handleFitScreen() {
    setIsFitMode(true);
    scrollToStart();
  }

  function handleActualSize() {
    setIsFitMode(false);
    setManualScale(1);
    scrollToStart();
  }

  function handleZoom(delta: number) {
    setIsFitMode(false);
    setManualScale((current) => {
      const base = isFitMode ? fitScale : current;
      return Number(Math.min(1.25, Math.max(0.22, base + delta)).toFixed(2));
    });
  }

  return (
    <section className="page-card flow-map-canvas-card" data-testid="flow-map-canvas">
      <div className="section-header">
        <div>
          <p className="eyebrow">实时流程图</p>
          <h2 className="section-title">项目实时流程地图</h2>
          <p className="muted">保留主线、并行支线、非阻塞节点、评审退回和颜色退出治理拓扑。</p>
        </div>
      </div>
      <div className="flow-map-toolbar" data-testid="flow-map-toolbar">
        <div className="flow-map-view-mode-bar" role="group" aria-label="流程地图视图模式">
          {[
            { value: 'all', label: '全部节点' },
            { value: 'mainline', label: '只看主线' },
            { value: 'risk', label: '只看风险节点' },
            { value: 'mine', label: '只看我的任务' },
            { value: 'open', label: '只看未完成' },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              className={viewMode === item.value ? 'flow-map-filter-active' : undefined}
              onClick={() => onViewModeChange(item.value as ViewMode)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flow-map-canvas-actions">
          <button type="button" onClick={handleFitScreen}>
            适应屏幕
          </button>
          <button type="button" onClick={handleActualSize}>
            100%
          </button>
          <button type="button" aria-label="缩小流程地图" onClick={() => handleZoom(-0.08)}>
            −
          </button>
          <button type="button" aria-label="放大流程地图" onClick={() => handleZoom(0.08)}>
            +
          </button>
          <button type="button" onClick={handleFitScreen}>
            重置位置
          </button>
          <div className="flow-map-filter-menu">
            <button
              type="button"
              aria-expanded={isFilterOpen}
              aria-controls="flow-map-filter-popover"
              onClick={() => setIsFilterOpen((current) => !current)}
            >
              图例 / 筛选
            </button>
            {isFilterOpen ? (
              <div id="flow-map-filter-popover">
                <FlowMapLegendFilterPopover
                  payload={payload}
                  viewMode={viewMode}
                  visibleCount={visibleCount}
                  onViewModeChange={onViewModeChange}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flow-map-scroll-shell" ref={scrollShellRef}>
        <div
          className="flow-map-viewport"
          style={{
            width: FLOW_MAP_CANVAS.width * effectiveScale,
            height: FLOW_MAP_CANVAS.height * effectiveScale,
          }}
        >
          <div
            className="flow-map-canvas"
            data-scale={effectiveScale.toFixed(2)}
            style={{
              width: FLOW_MAP_CANVAS.width,
              height: FLOW_MAP_CANVAS.height,
              transform: `scale(${effectiveScale})`,
            }}
          >
          <svg
            className="flow-map-connectors"
            viewBox={`0 0 ${FLOW_MAP_CANVAS.width} ${FLOW_MAP_CANVAS.height}`}
            aria-hidden="true"
          >
            <defs>
              <marker
                id="flow-map-arrow"
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M 0 0 L 8 3 L 0 6 z" />
              </marker>
            </defs>
            {payload.edges.map((edge) => (
              <FlowMapConnector
                key={`${edge.fromNodeCode}-${edge.toNodeCode}-${edge.edgeType}`}
                edge={edge}
              />
            ))}
          </svg>
          {payload.nodes.map((node) => (
            <FlowMapNode
              key={node.nodeCode}
              node={node}
              layout={FLOW_MAP_NODE_LAYOUT[node.nodeCode]}
              dimmed={!visibleNodeCodeSet.has(node.nodeCode)}
              selected={selectedNodeCode === node.nodeCode}
              onSelect={onSelectNode}
            />
          ))}
          <span className="flow-map-branch-label flow-map-branch-label-sample">自动并行</span>
          <span className="flow-map-branch-label flow-map-branch-label-procurement">自动并行 / 非阻塞</span>
          <span className="flow-map-branch-label flow-map-branch-label-return">N 退回至样车试制</span>
          <span className="flow-map-branch-label flow-map-branch-label-pass">Y 通过后进入评审与收费</span>
          </div>
        </div>
      </div>
      <div className="flow-map-mobile-hint">
        默认按视口适配完整宽度。需要查看细节时可放大或使用 100% 模式。
      </div>
    </section>
  );
}

export function FlowMapConnector({ edge }: { edge: ProjectFlowMapEdge }) {
  const path = FLOW_MAP_PATHS[`${edge.fromNodeCode}->${edge.toNodeCode}`];

  if (!path) {
    return null;
  }

  return (
    <g className={`flow-map-edge flow-map-edge-${edge.status} flow-map-edge-${edge.edgeType}`}>
      <path d={path} markerEnd="url(#flow-map-arrow)" />
    </g>
  );
}

export function FlowMapNode({
  node,
  layout,
  dimmed,
  selected,
  onSelect,
}: {
  node: ProjectFlowMapNode;
  layout: NodeLayout;
  dimmed?: boolean;
  selected?: boolean;
  onSelect: (node: ProjectFlowMapNode) => void;
}) {
  const tone = getFlowMapNodeTone(node.status);
  const ownerText = formatFlowMapNodeOwner(node);
  const metaText = getFlowMapNodeMetaText(node);

  return (
    <button
      type="button"
      className={[
        'flow-map-node',
        `flow-map-node-${tone}`,
        node.nodeType === 'DECISION' ? 'flow-map-node-decision' : '',
        node.nodeType === 'TERMINAL' ? 'flow-map-node-terminal' : '',
        dimmed ? 'flow-map-node-dimmed' : '',
        selected ? 'flow-map-node-selected' : '',
      ].filter(Boolean).join(' ')}
      style={{
        left: layout.x,
        top: layout.y,
        width: layout.width,
        height: layout.height,
      }}
      data-testid={`flow-map-node-${node.stepCode}`}
      aria-label={`第 ${node.stepCode} 步 ${node.stepName}，${node.statusLabel}，点击查看详情`}
      onClick={() => onSelect(node)}
    >
      <span className="flow-map-step">{node.stepCode}</span>
      <strong>{node.stepName}</strong>
      <small>{metaText}</small>
      <em>{ownerText}</em>
      {node.stepCode === '17' && node.monthlyReview ? (
        <span className="flow-map-node-progress">
          {node.monthlyReview.completedPeriods} / {node.monthlyReview.totalPeriods} 月
        </span>
      ) : null}
      {node.isOverdue ? <b>逾期 {node.overdueDays} 天</b> : null}
      <FlowMapNodeTooltip node={node} />
    </button>
  );
}

function FlowMapNodeTooltip({ node }: { node: ProjectFlowMapNode }) {
  return (
    <span className="flow-map-node-tooltip" role="tooltip">
      <span>步骤号：{node.stepCode}</span>
      <span>工序名称：{node.stepName}</span>
      <span>状态：{node.statusLabel}</span>
      <span>负责人：{node.ownerName ?? '未分配'}</span>
      <span>责任部门：{node.departmentName ?? '未分配'}</span>
      <span>截止时间：{formatDate(node.dueAt)}</span>
      <span>
        {node.isOverdue ? `逾期 ${node.overdueDays} 天` : '未逾期'}
      </span>
      <span>材料提交：{node.materialProgress.text}</span>
      <span>{node.taskId ? '点击查看详情' : '工序尚未触发，点击查看节点说明'}</span>
    </span>
  );
}

function ActivityTimeline({ payload }: { payload: ProjectFlowMapResponse }) {
  if (payload.recentActivities.length === 0) {
    return (
      <StatePanel
        compact
        title="暂无流转记录"
        description="项目流程产生节点创建、完成、退回或评审动作后会展示在这里。"
      />
    );
  }

  return (
    <div className="flow-map-activity-list">
      {payload.recentActivities.map((activity) => (
        <article key={activity.id} className="flow-map-activity-item">
          <time>{formatDateTime(activity.createdAt)}</time>
          <strong>{activity.actionLabel}</strong>
          <p>
            {activity.operatorName}：{activity.summary}
          </p>
        </article>
      ))}
    </div>
  );
}

function FlowMapNodeSummaryDrawer({
  open,
  node,
  payload,
  onClose,
}: {
  open: boolean;
  node: ProjectFlowMapNode | null;
  payload: ProjectFlowMapResponse;
  onClose: () => void;
}) {
  if (!open || !node) {
    return null;
  }

  return (
    <div className="task-detail-drawer-backdrop" role="presentation">
      <aside
        className="task-detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="flow-map-node-summary-title"
        data-testid="flow-map-node-summary-drawer"
      >
        <div className="task-detail-drawer-header">
          <div>
            <p className="eyebrow">工序详情</p>
            <h2 id="flow-map-node-summary-title">第 {node.stepCode} 步 {node.stepName}</h2>
            <p className="muted">{node.statusLabel} / 第 {node.roundNo || 0} 轮 / {node.departmentName ?? '未分配部门'}</p>
          </div>
          <button type="button" className="button button-secondary button-small" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="task-detail-drawer-body">
          <section className="task-detail-section">
            <h3>工序概况</h3>
            <div className="task-detail-grid">
              <DetailField label="所属项目" value={payload.projectName} />
              <DetailField label="颜色名称" value={payload.colorName} />
              <DetailField label="工序名称" value={node.stepName} />
              <DetailField label="状态" value={node.statusLabel} />
              <DetailField label="是否主线" value={node.isMainline ? '是' : '否'} />
              <DetailField label="是否阻塞主线" value={node.isBlocking ? '是' : '否'} />
            </div>
          </section>
          <section className="task-detail-section">
            <h3>责任与材料</h3>
            <div className="task-detail-grid">
              <DetailField label="负责人" value={node.ownerName ?? '未分配'} />
              <DetailField label="责任部门" value={node.departmentName ?? '未分配'} />
              <DetailField label="截止时间" value={formatDate(node.dueAt)} />
              <DetailField label="逾期天数" value={`${node.overdueDays} 天`} />
              <DetailField label="材料提交" value={node.materialProgress.text} />
              <DetailField label="缺失材料" value={`${node.materialProgress.missing} 项`} />
            </div>
          </section>
          {node.monthlyReview ? (
            <section className="task-detail-section">
              <h3>第 17 步月度评审</h3>
              <div className="task-detail-grid">
                <DetailField label="完成进度" value={node.monthlyReview.progressText} />
                <DetailField label="逾期月份" value={`${node.monthlyReview.overduePeriods} 个月`} />
                <DetailField
                  label="本月任务"
                  value={node.monthlyReview.currentMonthTask?.periodLabel ?? '未排期'}
                />
              </div>
            </section>
          ) : null}
          {node.colorExit ? (
            <section className="task-detail-section">
              <h3>第 18 步颜色退出</h3>
              <div className="task-detail-grid">
                <DetailField
                  label="年产量"
                  value={node.colorExit.annualOutput === null ? '未录入' : `${node.colorExit.annualOutput} 台`}
                />
                <DetailField
                  label="退出阈值"
                  value={node.colorExit.exitThreshold === null ? '未设置' : `${node.colorExit.exitThreshold} 台`}
                />
                <DetailField
                  label="系统建议"
                  value={getColorExitLabel(node.colorExit.systemSuggestion)}
                />
                <DetailField
                  label="人工结论"
                  value={getColorExitLabel(node.colorExit.finalDecision)}
                />
              </div>
            </section>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="task-detail-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function isNodeVisibleInMode(
  node: ProjectFlowMapNode,
  viewMode: ViewMode,
  currentUserName: string | null,
) {
  switch (viewMode) {
    case 'mainline':
      return node.isMainline || node.nodeType === 'DECISION' || node.nodeType === 'TERMINAL';
    case 'risk':
      return (
        node.isOverdue ||
        node.materialProgress.missing > 0 ||
        node.status === 'RETURNED' ||
        node.status === 'PENDING_REVIEW'
      );
    case 'mine':
      return Boolean(currentUserName && node.ownerName === currentUserName);
    case 'open':
      return node.status !== 'COMPLETED';
    case 'all':
    default:
      return true;
  }
}

function formatFlowMapNodeOwner(node: ProjectFlowMapNode) {
  if (!node.ownerName) {
    return '负责人待分配';
  }

  const departmentName = shortenDepartmentName(node.departmentName);

  return departmentName ? `${departmentName}｜${node.ownerName}` : node.ownerName;
}

function shortenDepartmentName(value: string | null) {
  if (!value) {
    return null;
  }

  return value
    .replace(/^演示/, '')
    .replace(/责任部门$/, '')
    .replace(/部门$/, '部')
    .slice(0, 6);
}

function getFlowMapNodeMetaText(node: ProjectFlowMapNode) {
  if (node.stepCode === '12') {
    return `第 ${node.roundNo || 1} 轮｜${node.statusLabel}`;
  }

  if (node.stepCode === '17' && node.monthlyReview) {
    return node.monthlyReview.progressText;
  }

  if (node.stepCode === '18' && node.colorExit) {
    return getColorExitLabel(node.colorExit.systemSuggestion);
  }

  if (node.dueAt && node.status !== 'COMPLETED') {
    return `${node.statusLabel}｜截止 ${formatDate(node.dueAt)}`;
  }

  return node.statusLabel;
}

function getFlowMapNodeTone(status: FlowMapNodeStatus | string) {
  switch (status) {
    case 'COMPLETED':
      return 'done';
    case 'IN_PROGRESS':
    case 'PENDING':
      return 'current';
    case 'PENDING_REVIEW':
      return 'review';
    case 'OVERDUE':
      return 'overdue';
    case 'RETURNED':
      return 'returned';
    case 'MONTHLY_TRACKING':
      return 'monthly';
    case 'EXIT_PENDING':
      return 'exit';
    case 'COMPLETED_LATE':
      return 'late';
    case 'NOT_STARTED':
    default:
      return 'not-started';
  }
}

function formatFlowMapDateTime(value: string | null | undefined) {
  if (!value) {
    return '未设置';
  }

  const date = new Date(value);
  const pad = (part: number) => part.toString().padStart(2, '0');

  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  ].join(' ');
}

function getColorExitLabel(value: keyof typeof COLOR_EXIT_SUGGESTION_LABELS | string | null) {
  if (!value) {
    return '未生成';
  }

  return COLOR_EXIT_SUGGESTION_LABELS[value as keyof typeof COLOR_EXIT_SUGGESTION_LABELS] ?? value;
}

export function getFlowMapEdgeTone(
  status: FlowMapEdgeStatus,
  edgeType: FlowMapEdgeType,
) {
  if (edgeType === 'return') {
    return 'return';
  }

  if (edgeType === 'nonBlocking') {
    return 'non-blocking';
  }

  return status;
}
