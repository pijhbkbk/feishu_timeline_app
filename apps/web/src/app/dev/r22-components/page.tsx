import { notFound } from 'next/navigation';

import { R22Card, R22Kpi, R22StatusBadge, R22TaskCard } from '../../../components/r22-ui';
import type { PersonalDashboardTask } from '../../../lib/dashboard-client';

const previewTask: PersonalDashboardTask = {
  taskId: 'preview-task',
  projectId: 'preview-project',
  projectCode: 'LC-2026-017',
  projectName: '轻卡星云灰定制色开发',
  projectPriority: 'HIGH',
  nodeCode: 'PAINT_DEVELOPMENT',
  nodeName: '涂料开发与首轮配方确认',
  status: 'IN_PROGRESS',
  dueAt: '2026-07-15T10:00:00.000Z',
  isOverdue: false,
  overdueDays: 0,
  completionPercent: 62,
  materials: { submitted: 2, required: 3, missing: 1 },
  progressHref: '/progress',
  projectHref: '/projects',
};

export default function R22ComponentsPreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  return (
    <div className="r22-page r22-component-preview">
      <header className="r22-page-hero"><div><p className="r22-overline">仅开发环境</p><h1>R22 组件预览</h1><p>Typography、Button、StatusBadge、Card、KPI、TaskCard 与状态面板。</p></div></header>
      <R22Card><div className="r22-section-heading"><div><p className="r22-overline">Typography</p><h2>清晰、克制、可读</h2></div></div><div className="r22-type-specimen"><h1>页面主标题 40</h1><h2>模块标题 28</h2><h3>卡片标题 18</h3><p>正文使用 16px，重要业务信息不依赖密集小字。</p><small>辅助信息 14px</small></div></R22Card>
      <R22Card><div className="r22-section-heading"><div><p className="r22-overline">Button / StatusBadge</p><h2>动作与状态</h2></div></div><div className="r22-preview-row"><button className="r22-button r22-button-primary">主要动作</button><button className="r22-button r22-button-secondary">次级动作</button><button className="r22-button r22-button-danger">危险动作</button><R22StatusBadge tone="brand">进行中</R22StatusBadge><R22StatusBadge tone="success">已完成</R22StatusBadge><R22StatusBadge tone="warning">待评审</R22StatusBadge><R22StatusBadge tone="danger">已逾期</R22StatusBadge><R22StatusBadge tone="monthly">月度跟踪</R22StatusBadge></div></R22Card>
      <section className="r22-kpi-grid"><R22Kpi label="待处理" value="6" hint="当前用户的任务" tone="brand" /><R22Kpi label="今日到期" value="2" hint="今天需要交付" tone="warning" /><R22Kpi label="已逾期" value="1" hint="需要优先处理" tone="danger" /><R22Kpi label="参与项目" value="4" hint="当前可见范围" /></section>
      <R22TaskCard task={previewTask} primary />
      <section className="r22-preview-state-grid"><R22Card className="r22-state-card"><R22StatusBadge tone="neutral">Empty</R22StatusBadge><h2>暂无数据</h2><p>创建或分配记录后会显示在这里。</p></R22Card><R22Card className="r22-state-card"><R22StatusBadge tone="danger">Error</R22StatusBadge><h2>加载失败</h2><p>保留用户已输入内容，并允许重新加载。</p></R22Card><R22Card className="r22-state-card"><R22StatusBadge tone="warning">Permission</R22StatusBadge><h2>没有访问权限</h2><p>请联系项目管理员确认角色和数据范围。</p></R22Card></section>
    </div>
  );
}
