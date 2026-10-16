import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth-client', () => ({
  apiRequest: vi.fn().mockResolvedValue([]),
}));

import { apiRequest } from './auth-client';
import { fetchConsistencyReviewPageOptions } from './consistency-reviews-client';
import { fetchMassProductionPageOptions } from './mass-production-client';
import { fetchPerformanceTestPageOptions } from './performance-tests-client';
import { fetchPilotProductionPageOptions } from './pilot-productions-client';
import { fetchUserDirectory } from './projects-client';
import { fetchSchedulePlanPageOptions } from './production-plans-client';
import { fetchCabinReviewPageOptions } from './reviews-client';
import { fetchVisualDeltaReviewPageOptions } from './visual-delta-reviews-client';

const mockedApiRequest = vi.mocked(apiRequest);

describe('least-privilege user directory client', () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
    mockedApiRequest.mockResolvedValue([]);
  });

  it('sends bounded and normalized directory query parameters', async () => {
    await fetchUserDirectory({
      projectId: ' project-1 ',
      q: ' 张 ',
      take: 50,
      cursor: ' user-1 ',
    });

    expect(mockedApiRequest).toHaveBeenCalledWith(
      '/users/directory?projectId=project-1&q=%E5%BC%A0&take=50&cursor=user-1',
    );
  });

  it('scopes every project workspace option request to its current project', async () => {
    await fetchMassProductionPageOptions('project-1');
    await fetchCabinReviewPageOptions('project-1');
    await fetchVisualDeltaReviewPageOptions('project-1');
    await fetchPerformanceTestPageOptions('project-1');
    await fetchSchedulePlanPageOptions('project-1');
    await fetchPilotProductionPageOptions('project-1');
    await fetchConsistencyReviewPageOptions('project-1');

    expect(mockedApiRequest).toHaveBeenCalledTimes(7);
    for (const [path] of mockedApiRequest.mock.calls) {
      expect(path).toBe('/users/directory?projectId=project-1&take=50');
    }
  });

  it('does not let read-only or non-member UI paths reconstruct the global directory', () => {
    const projectEditorSource = readFileSync(
      new URL('../components/project-editor.tsx', import.meta.url),
      'utf8',
    );
    const projectListSource = readFileSync(
      new URL('../components/projects-list-client.tsx', import.meta.url),
      'utf8',
    );

    expect(projectEditorSource).toContain("permissionCodes?.includes('project.write')");
    expect(projectEditorSource).toContain("if (props.mode === 'edit')");
    expect(projectEditorSource).toContain('setDirectoryUsers(buildProjectDirectory');
    expect(projectListSource).toContain("permissionCodes?.includes('project.write')");
    expect(projectListSource).toContain('getVisibleProjectOwners(projects.items)');

    for (const componentPath of [
      '../components/cabin-review-workspace.tsx',
      '../components/consistency-review-workspace.tsx',
      '../components/visual-delta-review-workspace.tsx',
    ]) {
      const source = readFileSync(new URL(componentPath, import.meta.url), 'utf8');
      expect(source).not.toContain('!users.some((item) => item.id === user.id)');
    }
  });
});
