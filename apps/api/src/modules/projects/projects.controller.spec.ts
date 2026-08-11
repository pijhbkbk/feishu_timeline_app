import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../auth/auth.types';
import { PERMISSION_METADATA_KEY, ROLE_METADATA_KEY } from '../auth/auth.constants';
import { ProjectsController } from './projects.controller';

describe('ProjectsController metadata', () => {
  it('protects read endpoints with project.read', () => {
    const prototype = ProjectsController.prototype;

    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.listProjects)).toEqual([
      'project.read',
    ]);
    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.getProjectDetail)).toEqual([
      'project.read',
    ]);
    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.getProjectStageOverview)).toEqual([
      'project.read',
    ]);
    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.getProjectTimeline)).toEqual([
      'project.read',
    ]);
  });

  it('protects write endpoints with project.write and PM roles', () => {
    const prototype = ProjectsController.prototype;

    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.createProject)).toEqual([
      'project.write',
    ]);
    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.updateProject)).toEqual([
      'project.write',
    ]);
    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.replaceProjectMembers)).toEqual([
      'project.write',
    ]);

    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.createProject)).toEqual([
      'admin',
      'project_manager',
    ]);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.updateProject)).toEqual([
      'admin',
      'project_manager',
    ]);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.replaceProjectMembers)).toEqual([
      'admin',
      'project_manager',
    ]);
  });

  it('passes the required Idempotency-Key header into project creation', async () => {
    const createProject = vi.fn().mockResolvedValue({ id: 'project-1' });
    const controller = new ProjectsController({ createProject } as never);
    const actor = { id: 'actor-1' } as AuthenticatedUser;

    await (
      controller.createProject as unknown as (
        body: Record<string, unknown>,
        currentActor: AuthenticatedUser,
        idempotencyKey?: string,
      ) => Promise<unknown>
    )({ name: '项目一' }, actor, 'project-create:controller-1');

    expect(createProject).toHaveBeenCalledWith(
      { name: '项目一' },
      actor,
      'project-create:controller-1',
    );
  });
});
