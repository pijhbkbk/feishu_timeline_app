import {
  formatDate,
  getWorkflowNodeLabel,
} from '../lib/projects-client';
import {
  type DevelopmentReportRecord,
  type DevelopmentReportTaskSummary,
} from '../lib/development-reports-client';
import { getWorkflowTaskStatusLabel } from '../lib/workflows-client';

type DevelopmentReportDetailProps = {
  report: DevelopmentReportRecord | null;
  activeTask: DevelopmentReportTaskSummary | null;
};

export function DevelopmentReportDetail({
  report,
  activeTask,
}: DevelopmentReportDetailProps) {
  if (!report) {
    return (
      <div className="empty-state">
        <strong>暂无开发报告详情</strong>
        <p>当前项目还没有保存过新颜色开发报告，先填写表单后再提交到流程节点。</p>
      </div>
    );
  }

  return (
    <section className="page-card">
      <div className="section-header">
        <div>
          <p className="eyebrow">Development Report</p>
          <h2 className="section-title">报告详情</h2>
          <p className="muted">展示最近一次保存的开发报告及其绑定的流程任务信息。</p>
        </div>
      </div>

      <div className="metadata-grid">
        <div className="metadata-item">
          <span>报告状态</span>
          <strong>{report.status === 'SUBMITTED' ? '已提交' : '草稿'}</strong>
        </div>
        <div className="metadata-item">
          <span>绑定节点</span>
          <strong>{getWorkflowNodeLabel(activeTask?.nodeCode ?? 'DEVELOPMENT_REPORT')}</strong>
        </div>
        <div className="metadata-item">
          <span>任务状态</span>
          <strong>{getWorkflowTaskStatusLabel(report.taskStatus)}</strong>
        </div>
        <div className="metadata-item">
          <span>提交时间</span>
          <strong>{formatDate(report.submittedAt)}</strong>
        </div>
      </div>

      <div className="detail-grid">
        <article className="detail-item">
          <span>报告标题</span>
          <strong>{report.reportTitle}</strong>
        </article>
        <article className="detail-item">
          <span>需求来源</span>
          <strong>{report.demandSource}</strong>
        </article>
        <article className="detail-item">
          <span>目标市场</span>
          <strong>{report.targetMarket ?? '未填写'}</strong>
        </article>
        <article className="detail-item">
          <span>目标车型</span>
          <strong>{report.targetVehicleModel ?? '未填写'}</strong>
        </article>
        <article className="detail-item">
          <span>目标颜色</span>
          <strong>{report.targetColorName}</strong>
        </article>
        <article className="detail-item">
          <span>对标颜色</span>
          <strong>{report.benchmarkColorRef ?? '未填写'}</strong>
        </article>
        <article className="detail-item">
          <span>预计上市时间</span>
          <strong>{formatDate(report.expectedLaunchDate)}</strong>
        </article>
        <article className="detail-item">
          <span>预计年需求</span>
          <strong>
            {report.estimatedAnnualVolume === null
              ? '未填写'
              : `${report.estimatedAnnualVolume.toLocaleString('zh-CN')} 台`}
          </strong>
        </article>
        <article className="detail-item detail-item-full">
          <span>开发原因</span>
          <strong>{report.developmentReason}</strong>
        </article>
        <article className="detail-item detail-item-full">
          <span>技术要求</span>
          <strong>{report.technicalRequirements ?? '未填写'}</strong>
        </article>
        <article className="detail-item detail-item-full">
          <span>质量要求</span>
          <strong>{report.qualityRequirements ?? '未填写'}</strong>
        </article>
        <article className="detail-item">
          <span>成本目标</span>
          <strong>{report.costTarget ?? '未填写'}</strong>
        </article>
        <article className="detail-item detail-item-full">
          <span>风险提示</span>
          <strong>{report.riskSummary ?? '未填写'}</strong>
        </article>
        <article className="detail-item detail-item-full">
          <span>备注</span>
          <strong>{report.remark ?? '未填写'}</strong>
        </article>
      </div>

      <div className="metadata-grid">
        <div className="metadata-item">
          <span>创建人</span>
          <strong>{report.createdByName ?? '未知'}</strong>
        </div>
        <div className="metadata-item">
          <span>最后更新人</span>
          <strong>{report.updatedByName ?? '未知'}</strong>
        </div>
        <div className="metadata-item">
          <span>提交人</span>
          <strong>{report.submittedByName ?? '未提交'}</strong>
        </div>
        <div className="metadata-item">
          <span>任务编号</span>
          <strong>{report.workflowTaskNo}</strong>
        </div>
      </div>
    </section>
  );
}
