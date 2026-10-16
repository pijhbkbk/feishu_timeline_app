import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  AttachmentActionMenu,
  AttachmentEntityBadge,
  AttachmentFilterBar,
  AttachmentList,
  AttachmentPreviewPanel,
  AttachmentUploader,
} from './attachments-workspace';
import {
  canMutateAttachmentInGenericWorkspace,
  getAttachmentPreviewKind,
  getEntityItemsForType,
  validateAttachmentBindInput,
  validateAttachmentUploadInput,
  type AttachmentEntityType,
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
      scanStatus: 'CLEAN',
      scannedAt: '2026-03-19T10:00:01.000Z',
      canDownload: true,
      materialType: '样板确认材料',
      versionNo: 1,
      replacesAttachmentId: null,
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
      fileUrl: null,
      scanStatus: 'LEGACY_UNSCANNED',
      scannedAt: null,
      canDownload: false,
      materialType: null,
      versionNo: 1,
      replacesAttachmentId: null,
      contentUrl: null,
      downloadUrl: null,
      previewUrl: null,
      canPreview: false,
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
    expect(getAttachmentPreviewKind(workspace.items[1]!)).toBe('none');
  });

  it('keeps domain-governed attachments read-only and directs users to their domain workspace', () => {
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
    expect(previewHtml).toContain('请前往对应领域工作区');
    expect(previewHtml).not.toContain('更新绑定');
    expect(previewHtml).not.toContain('解绑为项目附件');

    const actionHtml = renderToStaticMarkup(
      <AttachmentActionMenu
        attachment={workspace.items[0]!}
        canManage
        actingKey={null}
        onDelete={() => undefined}
      />,
    );
    expect(actionHtml).toContain('下载');
    expect(actionHtml).not.toContain('删除');

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

  it.each([
    'SAMPLE',
    'WORKFLOW_TASK',
    'REVIEW_RECORD',
    'PERFORMANCE_TEST',
  ] as const)('hides every generic mutation control for %s while retaining download', (entityType) => {
    const attachment = {
      ...workspace.items[0]!,
      entityType,
      targetType: entityType,
    };
    const previewHtml = renderToStaticMarkup(
      <AttachmentPreviewPanel
        projectId="project-1"
        attachment={attachment}
        canManage
        bindForm={{ entityType, entityId: attachment.entityId }}
        entityItems={[]}
        actingKey={null}
        onBindFormChange={() => undefined}
        onBind={() => undefined}
        onUnbind={() => undefined}
      />,
    );
    const actionHtml = renderToStaticMarkup(
      <AttachmentActionMenu
        attachment={attachment}
        canManage
        actingKey={null}
        onDelete={() => undefined}
      />,
    );

    expect(canMutateAttachmentInGenericWorkspace(entityType)).toBe(false);
    expect(previewHtml).toContain('请前往对应领域工作区');
    expect(previewHtml).toContain('下载附件');
    expect(previewHtml).not.toContain('更新绑定');
    expect(actionHtml).toContain('下载');
    expect(actionHtml).not.toContain('删除');
  });

  it('keeps PROJECT generic upload, bind and delete controls while excluding domain types from mutation selectors', () => {
    const projectAttachment = {
      ...workspace.items[0]!,
      entityType: 'PROJECT' as const,
      entityId: 'project-1',
      targetType: 'PROJECT' as const,
      targetId: 'project-1',
      entityLabel: 'PRJ-001 / 示例项目',
    };
    const allEntityTypes: AttachmentEntityType[] = [
      'PROJECT',
      'SAMPLE',
      'WORKFLOW_TASK',
      'STANDARD_BOARD',
      'PERFORMANCE_TEST',
      'REVIEW_RECORD',
      'NEW_COLOR_REPORT',
      'TRIAL_PRODUCTION',
    ];
    const allOptionsWorkspace: AttachmentWorkspaceResponse = {
      ...workspace,
      entityOptions: allEntityTypes.map((entityType) => ({
        entityType,
        label: entityType,
        items: [
          {
            id: entityType === 'PROJECT' ? 'project-1' : `${entityType.toLowerCase()}-1`,
            label: entityType,
            subtitle: null,
          },
        ],
      })),
    };
    const uploaderHtml = renderToStaticMarkup(
      <AttachmentUploader
        workspace={allOptionsWorkspace}
        value={{ entityType: 'PROJECT', entityId: 'project-1', file: null }}
        entityItems={getEntityItemsForType(allOptionsWorkspace, 'PROJECT')}
        disabled={false}
        onChange={() => undefined}
        onUpload={() => undefined}
      />,
    );
    const previewHtml = renderToStaticMarkup(
      <AttachmentPreviewPanel
        projectId="project-1"
        attachment={projectAttachment}
        canManage
        bindForm={{ entityType: 'PROJECT', entityId: 'project-1' }}
        entityItems={getEntityItemsForType(allOptionsWorkspace, 'PROJECT')}
        actingKey={null}
        onBindFormChange={() => undefined}
        onBind={() => undefined}
        onUnbind={() => undefined}
      />,
    );
    const actionHtml = renderToStaticMarkup(
      <AttachmentActionMenu
        attachment={projectAttachment}
        canManage
        actingKey={null}
        onDelete={() => undefined}
      />,
    );

    expect(canMutateAttachmentInGenericWorkspace('PROJECT')).toBe(true);
    expect(uploaderHtml).toContain('value="PROJECT"');
    expect(uploaderHtml).toContain('value="STANDARD_BOARD"');
    expect(uploaderHtml).toContain('value="NEW_COLOR_REPORT"');
    expect(uploaderHtml).toContain('value="TRIAL_PRODUCTION"');
    expect(uploaderHtml).not.toContain('value="SAMPLE"');
    expect(uploaderHtml).not.toContain('value="WORKFLOW_TASK"');
    expect(uploaderHtml).not.toContain('value="REVIEW_RECORD"');
    expect(uploaderHtml).not.toContain('value="PERFORMANCE_TEST"');
    expect(previewHtml).toContain('更新绑定');
    expect(actionHtml).toContain('删除');
  });

  it.each([
    'SAMPLE',
    'WORKFLOW_TASK',
    'REVIEW_RECORD',
    'PERFORMANCE_TEST',
  ] as const)('rejects generic client-side upload and bind validation for %s', (entityType) => {
    expect(
      validateAttachmentUploadInput({
        file: {} as File,
        entityType,
        entityId: 'domain-entity-1',
      }),
    ).toContain('对应领域工作区');
    expect(
      validateAttachmentBindInput({
        entityType,
        entityId: 'domain-entity-1',
      }),
    ).toContain('对应领域工作区');
  });

  it('shows legacy files as awaiting rescan and exposes no download or bind action', () => {
    const legacyAttachment = {
      ...workspace.items[0]!,
      id: 'legacy-attachment',
      scanStatus: 'LEGACY_UNSCANNED' as const,
      scannedAt: null,
      canDownload: false,
      canPreview: false,
      fileUrl: null,
      contentUrl: null,
      downloadUrl: null,
      previewUrl: null,
    };
    const listHtml = renderToStaticMarkup(
      <AttachmentList
        items={[legacyAttachment]}
        selectedAttachmentId="legacy-attachment"
        canManage
        actingKey={null}
        onSelect={() => undefined}
        onDelete={() => undefined}
      />,
    );
    const previewHtml = renderToStaticMarkup(
      <AttachmentPreviewPanel
        projectId="project-1"
        attachment={legacyAttachment}
        canManage
        bindForm={{ entityType: 'SAMPLE', entityId: 'sample-1' }}
        entityItems={getEntityItemsForType(workspace, 'SAMPLE')}
        actingKey={null}
        onBindFormChange={() => undefined}
        onBind={() => undefined}
        onUnbind={() => undefined}
      />,
    );

    expect(listHtml).toContain('历史文件待复扫');
    expect(previewHtml).toContain('历史文件待复扫');
    expect(previewHtml).not.toContain('下载附件');
    expect(previewHtml).not.toContain('更新绑定');
  });
});
