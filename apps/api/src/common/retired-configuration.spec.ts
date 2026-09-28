import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AdminControlCenterController } from '../modules/admin/admin-control-center.controller';
import { R26ReadModelController } from '../modules/r26-read-model/r26-read-model.controller';
import { AdminControlCenterService } from '../modules/admin/admin-control-center.service';
import { R26ReadModelService } from '../modules/r26-read-model/r26-read-model.service';
import { R26MemberAssignmentService } from '../modules/r26-read-model/r26-member-assignment.service';
import { R26OrdinaryCompletionService } from '../modules/r26-read-model/r26-ordinary-completion.service';
import { R26ProgressMaterialService } from '../modules/r26-read-model/r26-progress-material.service';
import { DownloadAdmissionService } from './download-admission.service';
import { UploadAdmissionService } from './upload-admission.service';

const retired = [
  ['POST', '/admin/organization/users/preview'], ['POST', '/admin/organization/users'],
  ['POST', '/admin/organization/users/person/preview'], ['POST', '/admin/organization/users/person'],
  ['POST', '/admin/organization/departments/preview'], ['POST', '/admin/organization/departments'],
  ['POST', '/admin/organization/departments/batch-delete'], ['POST', '/admin/organization/departments/dept/preview'],
  ['POST', '/admin/organization/departments/dept'], ['POST', '/admin/projects/project/assignments/PAINT_PROCUREMENT/preview'],
  ['POST', '/admin/projects/project/assignments/PAINT_PROCUREMENT'], ['POST', '/admin/permissions/role'],
  ['POST', '/admin/tasks/task/assignment-change-preview'], ['POST', '/admin/tasks/task/assignment-change'],
  ['POST', '/admin/tasks/batch-change-preview'], ['POST', '/admin/tasks/batch-change'], ['POST', '/admin/users/person/status-change'],
  ['POST', '/v2/projects/project/assignment-preview'], ['POST', '/v2/projects/project/members'],
  ['PATCH', '/v2/projects/project/members/person'], ['DELETE', '/v2/projects/project/members/person'],
  ['POST', '/v2/projects/project/assignments/apply'], ['PATCH', '/v2/projects/project/tasks/task/assignment'],
] as const;

describe('retired configuration HTTP boundary', () => {
  let app: INestApplication; let base: string;
  const reachedService = vi.fn(() => { throw new Error('Retired write reached service'); });
  beforeAll(async () => {
    @Module({
      controllers: [AdminControlCenterController, R26ReadModelController],
      providers: [AdminControlCenterService, R26ReadModelService, R26MemberAssignmentService, R26OrdinaryCompletionService, R26ProgressMaterialService, DownloadAdmissionService, UploadAdmissionService]
        .map(provide => ({ provide, useValue: { changeNodeAssignment: reachedService, changeUserStatus: reachedService, addMember: reachedService } })),
    })
    class RetiredConfigurationTestModule {}
    app = await NestFactory.create(RetiredConfigurationTestModule, { logger: false, abortOnError: false });
    await app.listen(0, '127.0.0.1'); base = await app.getUrl();
  });
  afterAll(async () => { await app?.close(); });
  it.each(retired)('%s %s returns 410 before any legacy mutation', async (method, path) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ code: 'LEGACY_CONFIGURATION_RETIRED' });
    expect(reachedService).not.toHaveBeenCalled();
  });
});
