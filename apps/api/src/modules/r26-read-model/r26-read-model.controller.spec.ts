import 'reflect-metadata';

import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { WorkflowNodeCode } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { PERMISSION_METADATA_KEY } from '../auth/auth.constants';
import { R26_ASSIGNMENT_RULES } from './r26-assignment.rules';
import { R26ReadModelController } from './r26-read-model.controller';

describe('R26ReadModelController Gate 2 contract', () => {
  it('exposes only GET handlers under the V2 read model', () => {
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
