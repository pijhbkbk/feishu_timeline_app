import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const serviceSource = readFileSync(
  join(__dirname, 'admin-control-center.service.ts'),
  'utf8',
);
const controllerSource = readFileSync(
  join(__dirname, 'admin-control-center.controller.ts'),
  'utf8',
);
const migrationSource = readFileSync(
  join(
    __dirname,
    '../../../prisma/migrations/20260725183000_r26_admin_control_center/migration.sql',
  ),
  'utf8',
);

describe('R26 administrator control center backend contracts', () => {
  it('requires administrator role and server-side system permission', () => {
    expect(controllerSource).toContain("@Roles('admin')");
    expect(controllerSource).toContain("@Permissions('system.manage')");
  });

  it('requires idempotency and uses a database transaction for commands', () => {
    expect(controllerSource).toContain("'idempotency-key'");
    expect(controllerSource).toContain('assertIdempotencyKey');
    expect(serviceSource).toContain('this.prisma.$transaction');
    expect(serviceSource).toContain('requestHash');
    expect(serviceSource).toContain('IDEMPOTENCY_KEY_REUSED');
    expect(migrationSource).toContain('admin_command_requests');
  });

  it('locks state-machine fields out of direct administrator updates', () => {
    const directUpdatePatterns = [
      /tx\.project\.update\([\s\S]{0,500}currentNodeCode:/,
      /tx\.project\.update\([\s\S]{0,500}status:/,
      /tx\.workflowTask\.update\([\s\S]{0,500}nodeCode:/,
      /tx\.workflowTask\.update\([\s\S]{0,500}status:/,
    ];
    for (const pattern of directUpdatePatterns) {
      expect(serviceSource).not.toMatch(pattern);
    }
    expect(serviceSource).toContain('SPECIAL_LOCKED_NODE_CODES');
    expect(serviceSource).toContain('HISTORY_LOCKED');
  });

  it('writes audit records for every controlled mutation family', () => {
    for (const action of [
      'ADMIN_PROJECT_BASIC_INFO_CHANGED',
      'ADMIN_TASK_SCHEDULE_CHANGED',
      'ADMIN_TASK_ASSIGNMENT_CHANGED',
      'ADMIN_USER_STATUS_CHANGED',
      'ADMIN_DICTIONARY_ITEM_CHANGED',
      'ADMIN_WORKFLOW_TEMPLATE_VERSION_CREATED',
      'ADMIN_PROJECT_NODE_ASSIGNMENT_CHANGED',
    ]) {
      expect(serviceSource).toContain(action);
    }
    expect(serviceSource.match(/createWithExecutor/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it('exposes a preview-first editable node-assignment command with concurrency protection', () => {
    expect(controllerSource).toContain(
      "assignments/:nodeCode/preview",
    );
    expect(controllerSource).toContain(
      "assignments/:nodeCode",
    );
    expect(serviceSource).toContain('buildNodeAssignmentPreview');
    expect(serviceSource).toContain('memberAssignmentVersion: input.expectedVersion');
    expect(serviceSource).toContain('STALE_MEMBER_ASSIGNMENT_VERSION');
    expect(serviceSource).toContain(
      'ProjectAssignmentSource.PROJECT_NODE_OVERRIDE',
    );
    expect(serviceSource).toContain('historicalTasksPreserved: true');
  });
});
