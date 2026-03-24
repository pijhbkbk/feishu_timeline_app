'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import {
  fetchSampleDetail,
  formatFileSize,
  getAttachmentContentUrl,
  getSampleConfirmationDecisionLabel,
  getSampleStatusLabel,
  getSampleTypeLabel,
  uploadSampleImage,
  type SampleDetailResponse,
} from '../lib/samples-client';
import { formatDate } from '../lib/projects-client';

type SampleDetailClientProps = {
  projectId: string;
  sampleId: string;
};

export function SampleDetailClient({
  projectId,
  sampleId,
}: SampleDetailClientProps) {
  const requestIdRef = useRef(0);
  const [detail, setDetail] = useState<SampleDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadDetail({ initial: true });
  }, [projectId, sampleId]);

  async function loadDetail(options?: { initial?: boolean }) {
    const requestId = ++requestIdRef.current;

    if (options?.initial) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    setError(null);

    try {
      const response = await fetchSampleDetail(projectId, sampleId);

      if (requestId !== requestIdRef.current) {
        return;
      }

      setDetail(response);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : '样板详情加载失败。');
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }

    setIsUploading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      for (const file of Array.from(files)) {
        await uploadSampleImage(projectId, sampleId, file);
      }

      await loadDetail();
      setSuccessMessage(`已上传 ${files.length} 张样板图片。`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '样板图片上传失败。');
    } finally {
      setIsUploading(false);
    }
  }

  if (isLoading || !detail) {
    return (
      <section className="page-card">
        <p className="eyebrow">Sample Detail</p>
        <h1>正在加载样板详情…</h1>
        <p>版本信息、图片和确认记录正在同步。</p>
      </section>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Sample Detail</p>
            <h2 className="section-title">{detail.sample.sampleName}</h2>
            <p className="muted">
              {detail.sample.sampleNo} / V{detail.sample.versionNo} /{' '}
              {getSampleStatusLabel(detail.sample.status)}
            </p>
          </div>
          <div className="inline-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={isRefreshing}
              onClick={() => void loadDetail()}
            >
              {isRefreshing ? '刷新中…' : '刷新'}
            </button>
            <Link href={`/projects/${projectId}/samples`} className="button button-secondary">
              返回列表
            </Link>
            <Link
              href={`/projects/${projectId}/attachments?entityType=SAMPLE&entityId=${detail.sample.id}`}
              className="button button-secondary"
            >
              查看附件中心
            </Link>
          </div>
        </div>

        <div className="metadata-grid">
          <div className="metadata-item">
            <span>样板编号</span>
            <strong>{detail.sample.sampleNo}</strong>
          </div>
          <div className="metadata-item">
            <span>当前版本</span>
            <strong>V{detail.sample.versionNo}</strong>
          </div>
          <div className="metadata-item">
            <span>样板类型</span>
            <strong>{getSampleTypeLabel(detail.sample.sampleType)}</strong>
          </div>
          <div className="metadata-item">
            <span>出样时间</span>
            <strong>{formatDate(detail.sample.producedAt)}</strong>
          </div>
        </div>
      </section>

      {error ? <p className="error-text">{error}</p> : null}
      {successMessage ? <p className="success-text">{successMessage}</p> : null}

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Sample Images</p>
            <h2 className="section-title">样板图片上传</h2>
            <p className="muted">图片二进制存本地对象存储目录，数据库仅保存附件元数据。</p>
          </div>
        </div>

        <div className="inline-actions">
          <label className="button button-primary upload-button">
            {isUploading ? '上传中…' : '上传图片'}
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={isUploading}
              onChange={(event) => void handleUpload(event.target.files)}
            />
          </label>
        </div>

        {detail.attachments.length === 0 ? (
          <div className="empty-state">
            <strong>暂无样板图片</strong>
            <p>至少上传一张图片后，样板颜色确认才能执行“通过”动作。</p>
          </div>
        ) : (
          <div className="image-grid">
            {detail.attachments.map((attachment) => (
              <article key={attachment.id} className="image-card">
                <img
                  src={getAttachmentContentUrl(attachment.contentUrl)}
                  alt={attachment.fileName}
                  className="sample-image"
                />
                <div className="cell-stack">
                  <strong>{attachment.fileName}</strong>
                  <span>{formatFileSize(attachment.fileSize)}</span>
                  <span>{formatDate(attachment.createdAt)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Versions</p>
            <h2 className="section-title">版本历史</h2>
            <p className="muted">同编号样板的所有版本按版本号倒序展示。</p>
          </div>
        </div>

        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>版本</th>
                <th>状态</th>
                <th>类型</th>
                <th>出样时间</th>
                <th>图片</th>
              </tr>
            </thead>
            <tbody>
              {detail.versions.map((version) => (
                <tr key={version.id}>
                  <td>
                    <div className="cell-stack">
                      <strong>
                        V{version.versionNo}
                        {version.isCurrent ? ' / 当前' : ''}
                      </strong>
                      <span>{version.sampleNo}</span>
                    </div>
                  </td>
                  <td>{getSampleStatusLabel(version.status)}</td>
                  <td>{getSampleTypeLabel(version.sampleType)}</td>
                  <td>{formatDate(version.producedAt)}</td>
                  <td>{version.imageCount} 张</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Confirmation History</p>
            <h2 className="section-title">确认记录</h2>
            <p className="muted">展示该样板编号关联版本的确认历史。</p>
          </div>
        </div>

        {detail.confirmations.length === 0 ? (
          <div className="empty-state">
            <strong>暂无确认记录</strong>
            <p>待流程进入样板颜色确认节点后，可在样板工作区提交确认表单。</p>
          </div>
        ) : (
          <div className="timeline-list">
            {detail.confirmations.map((confirmation) => (
              <article key={confirmation.id} className="timeline-card">
                <div className="timeline-header">
                  <strong>
                    {confirmation.sampleNo} / V{confirmation.sampleVersionNo}
                  </strong>
                  <span>{formatDate(confirmation.confirmedAt)}</span>
                </div>
                <p className="timeline-comment">
                  结果: {getSampleConfirmationDecisionLabel(confirmation.decision)} / 确认人:{' '}
                  {confirmation.confirmedByName ?? '未知'}
                </p>
                <p className="muted">
                  颜色评价: {confirmation.colorAssessment ?? '未填写'}；外观评价:{' '}
                  {confirmation.appearanceAssessment ?? '未填写'}
                </p>
                <p className="muted">说明: {confirmation.comment ?? '未填写'}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
