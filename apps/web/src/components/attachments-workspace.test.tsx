import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  AttachmentActionMenu,
  AttachmentEntityBadge,
  AttachmentFilterBar,
  AttachmentList,
  AttachmentPreviewPanel,
} from './attachments-workspace';
import {
  getAttachmentPreviewKind,
  getEntityItemsForType,
  validateAttachmentUploadInput,
  type AttachmentWorkspaceResponse,
} from '../lib/attachments-client';

const workspace: AttachmentWorkspaceResponse = {
  project: {
    id: 'project-1',
    code: 'PRJ-001',
    name: '示例项目',
    currentNodeCode: 'PROJECT_CLOSED',
    currentNodeName: '颜色退出',
    targetDate: '2026-03-31T00:00:00.000Z',
  },
  filters: {
    entityType: null,
    entityId: null,
    includeDeleted: false,
  },
  limits: {
    maxFileSizeBytes: 20 * 1024 * 1024,
  },
  statistics: {
    totalCount: 2,
    activeCount: 1,
    deletedCount: 1,
  },
  entityOptions: [
    {
      entityType: 'PROJECT',
      label: '项目级附件',
      items: [{ id: 'project-1', label: 'PRJ-001 / 示例项目', subtitle: '项目附件中心' }],
    },
    {
      entityType: 'SAMPLE',
      label: '样板',
      items: [{ id: 'sample-1', label: 'S-001 / 样板A', subtitle: 'V1' }],
    },
  ],
  items: [
    {
      id: 'attachment-1',
      projectId: 'project-1',
      entityType: 'SAMPLE',
      entityId: 'sample-1',
      entityLabel: 'S-001 / 样板A',
      targetType: 'SAMPLE',
      targetId: 'sample-1',
      fileName: 'sample.png',
      originalFileName: '样板图片.png',
      fileExtension: 'png',
      mimeType: 'image/png',
      contentType: 'image/png',
      fileSize: 2048,
      bucket: 'local-dev',
      storageKey: 'sample/sample-1/sample.png',
      objectKey: 'sample/sample-1/sample.png',
      fileUrl: '/attachments/attachment-1/content',
      contentUrl: '/attachments/attachment-1/content',
      downloadUrl: '/projects/project-1/attachments/attachment-1/download',
      previewUrl: '/projects/project-1/attachments/attachment-1/download?disposition=inline',
      canPreview: true,
      uploadedById: 'user-1',
      uploadedByName: '测试用户',
      uploadedAt: '2026-03-19T10:00:00.000Z',
      isDeleted: false,
      deletedAt: null,
      deletedById: null,
      deletedByName: null,
      createdAt: '2026-03-19T10:00:00.000Z',
      updatedAt: '2026-03-19T10:00:00.000Z',
    },
    {
      id: 'attachment-2',
      projectId: 'project-1',
      entityType: 'PROJECT',
      entityId: 'project-1',
      entityLabel: 'PRJ-001 / 示例项目',
      targetType: 'PROJECT',
      targetId: 'project-1',
      fileName: 'report.pdf',
      originalFileName: '报告.pdf',
      fileExtension: 'pdf',
      mimeType: 'application/pdf',
      contentType: 'application/pdf',
      fileSize: 4096,
      bucket: 'local-dev',
      storageKey: 'project/project-1/report.pdf',
      objectKey: 'project/project-1/report.pdf',
      fileUrl: '/attachments/attachment-2/content',
      contentUrl: '/attachments/attachment-2/content',
      downloadUrl: '/projects/project-1/attachments/attachment-2/download',
      previewUrl: '/projects/project-1/attachments/attachment-2/download?disposition=inline',
      canPreview: true,
      uploadedById: 'user-1',
      uploadedByName: '测试用户',
      uploadedAt: '2026-03-19T09:00:00.000Z',
      isDeleted: true,
      deletedAt: '2026-03-19T11:00:00.000Z',
      deletedById: 'user-2',
      deletedByName: '管理员',
      createdAt: '2026-03-19T09:00:00.000Z',
      updatedAt: '2026-03-19T11:00:00.000Z',
    },
  ],
};

describe('AttachmentsWorkspace', () => {
  it('renders attachment list and deleted row', () => {
    const html = renderToStaticMarkup(
      <AttachmentList
        items={workspace.items}
        selectedAttachmentId="attachment-1"
        canManage
        actingKey={null}
        onSelect={() => undefined}
        onDelete={() => undefined}
      />,
    );

    expect(html).toContain('样板图片.png');
    expect(html).toContain('报告.pdf');
    expect(html).toContain('已删除');
  });

  it('renders filter bar and preview logic', () => {
    const filterHtml = renderToStaticMarkup(
      <AttachmentFilterBar
        workspace={workspace}
        value={{
          entityType: 'SAMPLE',
          entityId: 'sample-1',
          includeDeleted: false,
        }}
        entityItems={getEntityItemsForType(workspace, 'SAMPLE')}
        onChange={() => undefined}
        onApply={() => undefined}
      />,
    );

    expect(filterHtml).toContain('实体类型');
    expect(filterHtml).toContain('样板');
    expect(getAttachmentPreviewKind(workspace.items[0]!)).toBe('image');
    expect(getAttachmentPreviewKind(workspace.items[1]!)).toBe('pdf');
  });

  it('renders preview panel and upload validation', () => {
    const previewHtml = renderToStaticMarkup(
      <AttachmentPreviewPanel
        projectId="project-1"
        attachment={workspace.items[0]!}
        canManage
        bindForm={{ entityType: 'SAMPLE', entityId: 'sample-1' }}
        entityItems={getEntityItemsForType(workspace, 'SAMPLE')}
        actingKey={null}
        onBindFormChange={() => undefined}
        onBind={() => undefined}
        onUnbind={() => undefined}
      />,
    );

    expect(previewHtml).toContain('文件预览');
    expect(previewHtml).toContain('样板图片.png');
    expect(previewHtml).toContain('更新绑定');

    const actionHtml = renderToStaticMarkup(
      <AttachmentActionMenu
        attachment={workspace.items[0]!}
        canManage
        actingKey={null}
        onDelete={() => undefined}
      />,
    );
    expect(actionHtml).toContain('下载');
    expect(actionHtml).toContain('删除');

    const badgeHtml = renderToStaticMarkup(<AttachmentEntityBadge entityType="REVIEW_RECORD" />);
    expect(badgeHtml).toContain('评审记录');

    expect(
      validateAttachmentUploadInput({
        file: null,
        entityType: 'PROJECT',
        entityId: 'project-1',
      }),
    ).toBe('请选择要上传的附件。');
  });
});
