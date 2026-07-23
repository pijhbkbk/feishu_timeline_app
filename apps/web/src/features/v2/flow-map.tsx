'use client';

import { useMemo, useState } from 'react';

import { r26FlowEdges, r26FlowNodes, r26StatusLabels } from './fixtures';
import { ZoomInIcon, ZoomOutIcon } from './icons';
import { useR26PrototypeStore } from './prototype-store';
import type { R26FlowNode, R26NodeStatus } from './types';

export function R26FlowMap({
  selectedNode,
  onSelectNode,
}: {
  selectedNode: R26FlowNode | null;
  onSelectNode: (node: R26FlowNode) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const { nodeStatusOverrides } = useR26PrototypeStore();

  const nodes = useMemo(
    () =>
      r26FlowNodes.map((node) => ({
        ...node,
        status:
          (node.taskId ? nodeStatusOverrides[node.taskId] : undefined) ?? node.status,
      })),
    [nodeStatusOverrides],
  );

  return (
    <section className="r26-map-card" aria-label="深海蓝项目固定流程地图">
      <div className="r26-map-toolbar">
        <div>
          <p className="r26-eyebrow">固定流程地图</p>
          <h2>18 步颜色开发流程</h2>
        </div>
        <div className="r26-map-toolbar__actions">
          <span>{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            aria-label="缩小流程地图"
            onClick={() => setZoom((value) => Math.max(0.75, Number((value - 0.25).toFixed(2))))}
          >
            <ZoomOutIcon />
          </button>
          <button type="button" aria-label="恢复流程地图比例" onClick={() => setZoom(1)}>
            适合宽度
          </button>
          <button
            type="button"
            aria-label="放大流程地图"
            onClick={() => setZoom((value) => Math.min(1.75, Number((value + 0.25).toFixed(2))))}
          >
            <ZoomInIcon />
          </button>
        </div>
      </div>

      <div className="r26-map-legend" aria-label="流程状态图例">
        {[
          ['completed', '已完成'],
          ['current', '进行中'],
          ['review', '待评审'],
          ['risk', '逾期 / 退回'],
          ['tracking', '月度跟踪'],
          ['exit', '待退出决定'],
        ].map(([tone, label]) => (
          <span key={tone} className={`r26-map-legend__${tone}`}>
            <i aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>

      <div className="r26-map-scroll" data-testid="r26-map-scroll">
        <svg
          viewBox="0 0 1440 1740"
          preserveAspectRatio="xMidYMin meet"
          className="r26-flow-svg"
          style={{ width: `${zoom * 100}%` }}
          data-testid="r26-flow-map-svg"
          aria-label="18 步轻卡定制色开发固定拓扑"
        >
          <defs>
            {(['mainline', 'parallel', 'nonBlocking', 'return'] as const).map((type) => (
              <marker
                key={type}
                id={`r26-arrow-${type}`}
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="5"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0 0 L10 5 L0 10 z" className={`r26-arrow r26-arrow--${type}`} />
              </marker>
            ))}
            <filter id="r26-selected-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#2563eb" floodOpacity=".18" />
            </filter>
          </defs>

          <g className="r26-flow-edges" aria-label="流程连线">
            {r26FlowEdges.map((edge) => (
              <path
                key={edge.id}
                d={edge.path}
                className={`r26-flow-edge r26-flow-edge--${edge.type}`}
                markerEnd={`url(#r26-arrow-${edge.type})`}
                data-testid={`r26-edge-${edge.id}`}
                data-edge-type={edge.type}
                data-from={edge.from}
                data-to={edge.to}
              />
            ))}
            <text x="880" y="988" className="r26-edge-label r26-edge-label--return">N</text>
            <text x="535" y="1028" className="r26-edge-label r26-edge-label--yes">Y</text>
            <text x="738" y="1102" className="r26-edge-label r26-edge-label--yes">Y</text>
          </g>

          <g className="r26-flow-nodes">
            {nodes.map((node) => (
              <FlowNode
                key={node.code}
                node={node}
                selected={selectedNode?.code === node.code}
                onSelect={onSelectNode}
              />
            ))}
          </g>
        </svg>
      </div>
    </section>
  );
}

function FlowNode({
  node,
  selected,
  onSelect,
}: {
  node: R26FlowNode;
  selected: boolean;
  onSelect: (node: R26FlowNode) => void;
}) {
  const status = node.status;
  const statusLabel = r26StatusLabels[status];
  const className = `r26-flow-node r26-flow-node--${status.toLowerCase().replaceAll('_', '-')} ${
    selected ? 'is-selected' : ''
  }`;

  return (
    <g
      className={className}
      role="button"
      tabIndex={0}
      aria-label={`第 ${node.step} 步 ${node.name}，${statusLabel}`}
      aria-pressed={selected}
      onClick={() => onSelect(node)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(node);
        }
      }}
      data-testid={`r26-node-${String(node.step).padStart(2, '0')}`}
      data-node-code={node.code}
      data-task-id={node.taskId ?? ''}
      data-status={status}
      data-x={node.x}
      data-y={node.y}
      data-width={node.width}
      data-height={node.height}
      data-shape={node.shape}
      filter={selected ? 'url(#r26-selected-shadow)' : undefined}
    >
      <title>{`第 ${node.step} 步 ${node.name}｜${statusLabel}｜${node.owner}｜${node.deadline}`}</title>
      <NodeShape node={node} />
      <NodeContent node={node} status={status} />
    </g>
  );
}

function NodeShape({ node }: { node: R26FlowNode }) {
  if (node.shape === 'decision') {
    const middleX = node.x + node.width / 2;
    const middleY = node.y + node.height / 2;
    return (
      <polygon
        points={`${middleX},${node.y} ${node.x + node.width},${middleY} ${middleX},${node.y + node.height} ${node.x},${middleY}`}
        className="r26-node-shape"
      />
    );
  }

  if (node.shape === 'monthly') {
    const circleX = node.x + 48;
    const circleY = node.y + node.height / 2;
    const radius = 32;
    const circumference = 2 * Math.PI * radius;
    return (
      <>
        <rect
          x={node.x}
          y={node.y}
          width={node.width}
          height={node.height}
          rx="28"
          className="r26-node-shape"
        />
        <circle cx={circleX} cy={circleY} r={radius} className="r26-monthly-track" />
        <circle
          cx={circleX}
          cy={circleY}
          r={radius}
          className="r26-monthly-progress"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * 0.75}
          transform={`rotate(-90 ${circleX} ${circleY})`}
        />
        <text x={circleX} y={circleY + 5} textAnchor="middle" className="r26-monthly-value">3/12</text>
      </>
    );
  }

  return (
    <rect
      x={node.x}
      y={node.y}
      width={node.width}
      height={node.height}
      rx={node.shape === 'terminal' ? 42 : 18}
      className="r26-node-shape"
    />
  );
}

function NodeContent({ node, status }: { node: R26FlowNode; status: R26NodeStatus }) {
  const isMonthly = node.shape === 'monthly';
  const contentX = isMonthly ? node.x + 88 : node.x + 16;
  const name = node.shortName ?? node.name;
  const lines = splitNodeName(name);
  const nameY = node.y + (node.shape === 'decision' ? 47 : 34);

  return (
    <g className="r26-node-copy" pointerEvents="none">
      <text x={contentX} y={node.y + 18} className="r26-node-meta">
        {`第 ${String(node.step).padStart(2, '0')} 步 · ${r26StatusLabels[status]}`}
      </text>
      <text x={contentX} y={nameY} className="r26-node-title">
        {lines.map((line, index) => (
          <tspan key={line} x={contentX} dy={index === 0 ? 0 : 18}>{line}</tspan>
        ))}
      </text>
      {node.shape !== 'decision' ? (
        <>
          <text x={contentX} y={node.y + node.height - 24} className="r26-node-detail">{node.owner}</text>
          <text x={contentX} y={node.y + node.height - 8} className="r26-node-deadline">{node.deadline}</text>
        </>
      ) : (
        <text x={node.x + node.width / 2} y={node.y + 101} textAnchor="middle" className="r26-node-deadline">
          {node.deadline}
        </text>
      )}
    </g>
  );
}

function splitNodeName(name: string) {
  if (name.length <= 9) {
    return [name];
  }

  if (name.includes('、')) {
    const [first, second] = name.split('、');
    return [`${first}、`, second];
  }

  const splitAt = Math.ceil(name.length / 2);
  return [name.slice(0, splitAt), name.slice(splitAt)];
}
