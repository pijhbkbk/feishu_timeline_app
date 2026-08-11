import 'reflect-metadata';

import { RequestMethod } from '@nestjs/common';
import {
  INTERCEPTORS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { WorkflowNodeCode } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { PERMISSION_METADATA_KEY } from '../auth/auth.constants';
import { DownloadAdmissionInterceptor } from '../../common/download-admission.interceptor';
import { R26_ASSIGNMENT_RULES } from './r26-assignment.rules';
import { R26ReadModelController } from './r26-read-model.controller';

describe('R26ReadModelController Gate 3C1 contract', () => {
  it('guards the historical material content stream with download admission', () => {
    expect(
      Reflect.getMetadata(
        INTERCEPTORS_METADATA,
        R26ReadModelController.prototype.getMaterialVersionContent,
      ),
    ).toContain(DownloadAdmissionInterceptor);
    expect(
      Reflect.getMetadata(
        PERMISSION_METADATA_KEY,
        R26ReadModelController.prototype.getMaterialVersionContent,
      ),
    ).toEqual(['project.read']);
  });
  it('keeps the Gate 2 view-model handlers GET-only', () => {
    const prototype = R26ReadModelController.prototype;
    const handlerNames = [
      'getDashboard',
      'getProjects',
      'getWorkspace',
      'getTask',
      'getProgressContext',
    ] as const;

    expect(Reflect.getMetadata(PATH_METADATA, R26ReadModelController)).toBe('v2');

    for (const handlerName of handlerNames) {
      const handler = prototype[handlerName];
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
      expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, handler)).toEqual([
        handlerName === 'getDashboard' ? 'dashboard.read' : 'project.read',
      ]);
    }
  });

  it('keeps the approved Gate 3A member and assignment write routes', () => {
    const prototype = R26ReadModelController.prototype;
    const previewHandler = prototype.previewAssignments;
    expect(Reflect.getMetadata(METHOD_METADATA, previewHandler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, previewHandler)).toBe(
      'projects/:projectId/assignment-preview',
    );
    expect(
      Reflect.getMetadata(PERMISSION_METADATA_KEY, previewHandler),
    ).toEqual(['project.read']);

    const writeHandlers = [
      ['addMember', RequestMethod.POST, 'projects/:projectId/members'],
      ['updateMember', RequestMethod.PATCH, 'projects/:projectId/members/:userId'],
      ['removeMember', RequestMethod.DELETE, 'projects/:projectId/members/:userId'],
      ['applyAssignments', RequestMethod.POST, 'projects/:projectId/assignments/apply'],
      ['transferTask', RequestMethod.PATCH, 'projects/:projectId/tasks/:taskId/assignment'],
    ] as const;

    for (const [handlerName, method, path] of writeHandlers) {
      const handler = prototype[handlerName];
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, handler)).toEqual([
        'project.write',
      ]);
    }

    expect(Object.getOwnPropertyNames(prototype)).not.toContain('transitionWorkflow');
  });

  it('splits Gate 3B progress and material writes by the editable permission matrix', () => {
    const prototype = R26ReadModelController.prototype;
    const progressHandlers = [
      ['saveProgressDraft', RequestMethod.PUT, 'tasks/:taskId/progress-draft'],
      ['deleteProgressDraft', RequestMethod.DELETE, 'tasks/:taskId/progress-draft'],
      ['submitProgress', RequestMethod.POST, 'tasks/:taskId/progress-updates'],
    ] as const;
    const materialHandlers = [
      ['uploadMaterial', RequestMethod.POST, 'tasks/:taskId/materials'],
      [
        'uploadMaterialVersion',
        RequestMethod.POST,
        'tasks/:taskId/materials/:attachmentId/versions',
      ],
    ] as const;

    for (const [handlerName, method, path] of progressHandlers) {
      const handler = prototype[handlerName];
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, handler)).toEqual([
        'workflow.transition',
      ]);
    }

    for (const [handlerName, method, path] of materialHandlers) {
      const handler = prototype[handlerName];
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, handler)).toEqual([
        'attachment.manage',
      ]);
    }

    expect(Object.getOwnPropertyNames(prototype)).not.toContain('completeTask');
    expect(Object.getOwnPropertyNames(prototype)).not.toContain('approveTask');
    expect(Object.getOwnPropertyNames(prototype)).not.toContain('rejectTask');
    expect(Object.getOwnPropertyNames(prototype)).not.toContain('transitionWorkflow');
  });

  it('opens only the three Gate 3C1 ordinary-completion commands', () => {
    const prototype = R26ReadModelController.prototype;
    const handlers = [
      [
        'previewOrdinaryCompletion',
        RequestMethod.POST,
        'tasks/:taskId/completion-preview',
      ],
      [
        'completeOrdinaryTask',
        RequestMethod.POST,
        'tasks/:taskId/complete',
      ],
      [
        'resolveTaskBlocker',
        RequestMethod.POST,
        'tasks/:taskId/blockers/:blockerId/resolve',
      ],
    ] as const;

    for (const [handlerName, method, path] of handlers) {
      const handler = prototype[handlerName];
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(
        Reflect.getMetadata(PERMISSION_METADATA_KEY, handler),
      ).toEqual(['workflow.transition']);
    }

    expect(Object.getOwnPropertyNames(prototype)).not.toContain(
      'approveReview',
    );
    expect(Object.getOwnPropertyNames(prototype)).not.toContain(
      'rejectReview',
    );
    expect(Object.getOwnPropertyNames(prototype)).not.toContain(
      'collectFee',
    );
    expect(Object.getOwnPropertyNames(prototype)).not.toContain(
      'completeMonthlyReview',
    );
    expect(Object.getOwnPropertyNames(prototype)).not.toContain(
      'decideColorExit',
    );
  });

  it('defines a server-side assignment rule for all 18 workflow nodes', () => {
    expect(Object.keys(R26_ASSIGNMENT_RULES)).toHaveLength(18);
    expect(new Set(Object.keys(R26_ASSIGNMENT_RULES))).toEqual(
      new Set(Object.values(WorkflowNodeCode)),
    );
    for (const rule of Object.values(R26_ASSIGNMENT_RULES)) {
      expect(rule.primaryDepartment.code.length).toBeGreaterThan(0);
      expect(rule.primaryDepartment.name.length).toBeGreaterThan(0);
      expect(Array.isArray(rule.collaboratorDepartments)).toBe(true);
    }

    expect(R26_ASSIGNMENT_RULES[WorkflowNodeCode.PAINT_DEVELOPMENT].primaryDepartment.name)
      .toBe('采购部');
    expect(R26_ASSIGNMENT_RULES[WorkflowNodeCode.MASS_PRODUCTION_PLAN].primaryDepartment.name)
      .toBe('生产部');
    expect(R26_ASSIGNMENT_RULES[WorkflowNodeCode.PROJECT_CLOSED].primaryDepartment.name)
      .toBe('营销公司');
  });
});
