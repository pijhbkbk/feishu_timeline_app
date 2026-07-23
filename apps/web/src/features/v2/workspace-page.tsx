'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { r26FlowNodes, r26StatusLabels } from './fixtures';
import { AlertIcon, CheckIcon, CloseIcon } from './icons';
import { R26FlowMap } from './flow-map';
import { useR26PrototypeStore } from './prototype-store';
import type { R26FlowNode } from './types';
import { StatusPill } from './ui';

export function WorkspacePage({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { progressSubmitted, nodeStatusOverrides, recentActivities } = useR26PrototypeStore();

  const initialNode = useMemo(
    () =>
      findNodeFromQuery(searchParams.get('taskId'), searchParams.get('nodeCode')) ??
      r26FlowNodes.find((node) => node.step === 6) ??
      null,
    [],
  );
  const [selectedNode, setSelectedNode] = useState<R26FlowNode | null>(initialNode);
  const [staticNotice, setStaticNotice] = useState<string | null>(null);

  useEffect(() => {
    const queryNode = findNodeFromQuery(searchParams.get('taskId'), searchParams.get('nodeCode'));
    if (queryNode) {
      setSelectedNode(queryNode);
    } else if (window.matchMedia('(max-width: 767px)').matches) {
      setSelectedNode(null);
    }
  }, [searchParams]);

  if (projectId !== 'demo-r26') {
    return (
      <div className="r26-page">
        <section className="r26-empty-state">
          <strong>本轮只提供深海蓝项目工作区</strong>
          <p>返回项目列表，从深海蓝项目卡进入固定流程地图。</p>
          <Link className="r26-button r26-button--primary" href="/v2/projects">返回项目列表</Link>
        </section>
      </div>
    );
  }

  const resolvedSelectedNode = selectedNode
    ? resolvePrototypeNode(selectedNode, progressSubmitted, nodeStatusOverrides)
    : null;

  function selectNode(node: R26FlowNode) {
    setSelectedNode(node);
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
    setSelectedNode(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('taskId');
    params.delete('nodeCode');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function showStaticNotice(message: string) {
    setStaticNotice(message);
    window.setTimeout(() => setStaticNotice(null), 2600);
  }

  return (
    <div className="r26-page r26-workspace-page" data-testid="r26-workspace">
      <header className="r26-project-header">
        <div className="r26-project-header__identity">
          <Link href="/v2/projects" aria-label="返回项目列表">项目列表</Link>
          <span aria-hidden="true">/</span>
          <div>
            <span className="r26-color-swatch" style={{ background: '#1f4e79' }} aria-label="深海蓝色样" />
            <div>
              <h1>深海蓝</h1>
              <p>轻卡定制色开发项目</p>
            </div>
          </div>
        </div>
        <dl className="r26-project-header__facts">
          <div><dt>当前工序</dt><dd>{progressSubmitted ? '第 10 步 · 首台生产计划' : '第 06 步 · 涂料采购'}</dd></div>
          <div><dt>负责人</dt><dd>{progressSubmitted ? '赵知行 · 生产部' : '张七巧 · 采购部'}</dd></div>
          <div><dt>流程进度</dt><dd>{progressSubmitted ? '8 / 18' : '7 / 18'}</dd></div>
          <div><dt>最近更新</dt><dd>{progressSubmitted ? '刚刚' : '今天 10:08'}</dd></div>
        </dl>
      </header>

      <div className={`r26-workspace-layout ${resolvedSelectedNode ? 'has-detail' : ''}`}>
        <R26FlowMap selectedNode={resolvedSelectedNode} onSelectNode={selectNode} />
        {resolvedSelectedNode ? (
          <TaskDetail
            node={resolvedSelectedNode}
            onClose={closeDetail}
            onStaticAction={showStaticNotice}
          />
        ) : null}
      </div>

      <section className="r26-card r26-workspace-activity">
        <div className="r26-section-heading">
          <div>
            <p className="r26-eyebrow">最近活动</p>
            <h2>项目事实按时间保留</h2>
          </div>
          <span>静态原型记录</span>
        </div>
        <ol>
          {recentActivities.slice(0, 4).map((activity, index) => (
            <li key={`${activity.time}-${activity.text}-${index}`}>
              <time>{activity.time}</time>
              <strong>{activity.text}</strong>
              <span>{index === 0 && progressSubmitted ? '进展提交' : '项目记录'}</span>
            </li>
          ))}
        </ol>
      </section>

      {staticNotice ? <div className="r26-toast" role="status">{staticNotice}</div> : null}
    </div>
  );
}

function TaskDetail({
  node,
  onClose,
  onStaticAction,
}: {
  node: R26FlowNode;
  onClose: () => void;
  onStaticAction: (message: string) => void;
}) {
  const isStep12 = node.step === 12;
  const isStep17 = node.step === 17;
  const isStep18 = node.step === 18;

  return (
    <aside className="r26-task-detail" aria-label={`${node.name}工序详情`} data-testid="r26-task-detail">
      <header className="r26-task-detail__header">
        <div>
          <p>第 {String(node.step).padStart(2, '0')} 步 · 第 {node.round} 轮</p>
          <h2>{node.name}</h2>
          <StatusPill tone={statusTone(node.status)}>{r26StatusLabels[node.status]}</StatusPill>
        </div>
        <button type="button" aria-label="关闭工序详情" onClick={onClose}>
          <CloseIcon />
        </button>
      </header>

      <div className="r26-task-detail__body">
        <section className="r26-task-conclusion" data-testid="task-conclusion">
          <span>当前结论</span>
          <strong>{detailConclusion(node)}</strong>
          <p>{detailNextAction(node)}</p>
        </section>

        <DetailSection title="责任信息">
          <DetailGrid
            items={[
              ['负责人', node.owner],
              ['协作人', node.collaborators.join('、')],
              ['审批人', node.approver],
              ['责任部门', node.department],
            ]}
          />
        </DetailSection>

        <DetailSection title="时间与进度">
          <DetailGrid
            items={[
              ['开始时间', node.startedAt],
              ['截止 / 状态', node.deadline],
              ['剩余工作日', node.remainingDays === null ? '按前置节点确定' : `${node.remainingDays} 天`],
              ['逾期天数', node.overdueDays > 0 ? `${node.overdueDays} 天` : '未逾期'],
            ]}
          />
        </DetailSection>

        <DetailSection title="工作要求与输出物">
          <p>{node.requirement}</p>
          <div className="r26-output-box"><span>预期输出</span><strong>{node.output}</strong></div>
        </DetailSection>

        <DetailSection title="材料完整性">
          <div className="r26-material-summary">
            <strong>{node.uploadedMaterials.length} / {node.requiredMaterials.length}</strong>
            <span>
              {node.missingMaterials.length === 0
                ? '必交材料已齐备'
                : `仍缺 ${node.missingMaterials.length} 项必交材料`}
            </span>
          </div>
          <ul className="r26-material-list">
            {node.requiredMaterials.map((material) => {
              const uploaded = node.uploadedMaterials.includes(material);
              return (
                <li key={material} className={uploaded ? 'is-complete' : 'is-missing'}>
                  <span>{uploaded ? <CheckIcon /> : <AlertIcon />}</span>
                  <div><strong>{material}</strong><small>{uploaded ? '已上传' : '缺失'}</small></div>
                </li>
              );
            })}
          </ul>
        </DetailSection>

        {isStep12 ? (
          <DetailSection title="评审与历史轮次" testId="step12-special-detail">
            <div className="r26-review-choice">
              <div><span>当前轮次</span><strong>第 2 轮 · 等待结论</strong></div>
              <div><span>上一轮</span><strong>退回：喷涂均匀性不符合要求</strong></div>
              <div><span>返工要求</span><strong>调整喷涂参数后重新提交样车</strong></div>
            </div>
            <p>退回会返回第 11 步并保留上一轮历史；本轮按钮仅展示交互层级。</p>
          </DetailSection>
        ) : null}

        {isStep17 ? (
          <DetailSection title="月度评审" testId="step17-special-detail">
            <div className="r26-monthly-detail">
              <div><strong>3 / 12</strong><span>已完成月份</span></div>
              <div><strong>4 月</strong><span>曾逾期，已补录</span></div>
              <div><strong>8月15日</strong><span>下一评审日期</span></div>
            </div>
            <p>每个月份保留独立实例，不压缩为单一完成状态。</p>
          </DetailSection>
        ) : null}

        {isStep18 ? (
          <DetailSection title="颜色退出决定" testId="step18-special-detail">
            <DetailGrid
              items={[
                ['年产量', '4,800 台'],
                ['退出阈值', '5,000 台'],
                ['系统建议', '建议继续观察'],
                ['人工决定', '待授权人员确认'],
              ]}
            />
            <p>系统建议不代替人工决定，静态原型不执行退出动作。</p>
          </DetailSection>
        ) : null}

        <DetailSection title="最近流转与审计">
          <ol className="r26-detail-events">
            {node.recentEvents.map((event) => (
              <li key={`${event.time}-${event.text}`}>
                <time>{event.time}</time>
                <p>{event.text}</p>
              </li>
            ))}
          </ol>
        </DetailSection>
      </div>

      <footer className="r26-task-detail__footer">
        {node.taskId === 't006' ? (
          <Link href="/v2/progress?projectId=demo-r26&taskId=t006" className="r26-button r26-button--primary">
            提交进展
          </Link>
        ) : isStep12 ? (
          <>
            <button type="button" className="r26-button r26-button--secondary" onClick={() => onStaticAction('退回操作将在真实数据联调轮次接入后端门禁。')}>
              退回（静态）
            </button>
            <button type="button" className="r26-button r26-button--primary" onClick={() => onStaticAction('通过操作将在真实数据联调轮次接入后端门禁。')}>
              通过（静态）
            </button>
          </>
        ) : (
          <button type="button" className="r26-button r26-button--primary" onClick={() => onStaticAction('本轮不执行真实流程动作。')}>
            查看后续动作
          </button>
        )}
      </footer>
    </aside>
  );
}

function DetailSection({
  title,
  children,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section className="r26-detail-section" data-testid={testId}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function DetailGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="r26-detail-grid">
      {items.map(([label, value]) => (
        <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
      ))}
    </dl>
  );
}

function findNodeFromQuery(taskId: string | null, nodeCode: string | null) {
  if (taskId) {
    return r26FlowNodes.find((node) => node.taskId === taskId) ?? null;
  }
  if (nodeCode) {
    return r26FlowNodes.find((node) => node.code === nodeCode) ?? null;
  }
  return null;
}

function resolvePrototypeNode(
  node: R26FlowNode,
  progressSubmitted: boolean,
  nodeStatusOverrides: Record<string, R26FlowNode['status']>,
) {
  const status = (node.taskId ? nodeStatusOverrides[node.taskId] : undefined) ?? node.status;
  if (!progressSubmitted || node.taskId !== 't006') {
    return { ...node, status };
  }

  return {
    ...node,
    status,
    uploadedMaterials: [...node.requiredMaterials],
    missingMaterials: [],
    recentEvents: [
      { time: '刚刚', text: '张七巧提交了涂料采购进展与到货确认记录' },
      ...node.recentEvents,
    ],
  };
}

function detailConclusion(node: R26FlowNode) {
  if (node.step === 6) {
    return node.status === 'COMPLETED'
      ? '采购已完成，材料齐备，可进入后续工序。'
      : '采购仍在进行，当前缺少到货确认记录。';
  }
  if (node.step === 12) {
    return '第 2 轮正在等待评审结论。';
  }
  if (node.step === 17) {
    return '已完成 3 / 12 次月度评审，下次评审为 8月15日。';
  }
  if (node.step === 18) {
    return '系统建议继续观察，最终退出结论必须人工确认。';
  }
  return `${r26StatusLabels[node.status]}，按当前工序要求继续推进。`;
}

function detailNextAction(node: R26FlowNode) {
  if (node.step === 6) {
    return node.status === 'COMPLETED'
      ? '下一步：跟进标准板制作、涂料性能试验和首台生产计划。'
      : '下一步：补齐到货确认记录并提交本次进展。';
  }
  if (node.step === 12) {
    return '下一步：选择通过，或退回第 11 步并保留上一轮历史。';
  }
  if (node.step === 17) {
    return '下一步：按月保留独立评审实例，不覆盖历史月份。';
  }
  if (node.step === 18) {
    return '下一步：由授权人员结合 4,800 台年产量与 5,000 台阈值作出决定。';
  }
  return `下一步：${node.output}。`;
}

function statusTone(status: R26FlowNode['status']) {
  if (status === 'COMPLETED' || status === 'COMPLETED_LATE') return 'completed';
  if (status === 'OVERDUE' || status === 'RETURNED') return 'risk';
  if (status === 'PENDING_REVIEW') return 'review';
  if (status === 'MONTHLY_TRACKING') return 'tracking';
  if (status === 'EXIT_PENDING') return 'exit';
  if (status === 'IN_PROGRESS') return 'current';
  return 'neutral';
}
