import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const editorSource = readFileSync(
  new URL('./project-editor.tsx', import.meta.url),
  'utf8',
);
const clientSource = readFileSync(
  new URL('../lib/projects-client.ts', import.meta.url),
  'utf8',
);

describe('ProjectEditor legacy ownership and member write boundary', () => {
  it('does not submit owner changes from the generic project edit form', () => {
    const editHandler = editorSource.slice(
      editorSource.indexOf('async function handleSaveProjectBasics'),
      editorSource.indexOf('const project ='),
    );

    expect(editHandler).not.toContain('ownerUserId:');
    expect(editorSource).toContain('负责人变更必须通过受版本控制的成员分工流程完成');
  });

  it('does not expose the retired bulk-member replacement client or action', () => {
    expect(editorSource).not.toContain('replaceProjectMembers');
    expect(clientSource).not.toMatch(/\/projects\/\$\{projectId\}\/members/);
    expect(editorSource).toContain('成员变更必须通过受版本控制的成员分工流程完成');
  });

  it('submits the displayed project updatedAt through an ownership-free PATCH contract', () => {
    const editHandler = editorSource.slice(
      editorSource.indexOf('async function handleSaveProjectBasics'),
      editorSource.indexOf('const project ='),
    );

    expect(editHandler).toContain('const expectedVersion = currentProject?.updatedAt;');
    expect(editHandler).toContain('expectedVersion,');
    expect(clientSource).toContain('export type ProjectUpdatePayload');

    const updatePayload = clientSource.slice(
      clientSource.indexOf('export type ProjectUpdatePayload'),
      clientSource.indexOf('export const PROJECT_STATUS_OPTIONS'),
    );
    const updateClient = clientSource.slice(
      clientSource.indexOf('export function updateProject'),
      clientSource.indexOf('export function fetchUserDirectory'),
    );

    expect(updatePayload).toContain('expectedVersion: string;');
    expect(updatePayload).not.toContain('ownerUserId');
    expect(updatePayload).not.toContain('owningDepartmentId');
    expect(updateClient).toContain('payload: ProjectUpdatePayload');
  });
});
