import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth-client', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from './auth-client';
import {
  executeWorkflowAction,
  type WorkflowAction,
} from './workflows-client';

const mockedApiRequest = vi.mocked(apiRequest);

describe('generic workflow action client', () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
  });

  it.each<WorkflowAction>([
    'SUBMIT',
    'COMPLETE',
    'APPROVE',
    'REJECT',
    'RETURN',
  ])('rejects %s locally without sending a request', async (action) => {
    await expect(
      executeWorkflowAction('task-1', action),
    ).rejects.toThrow('终态流转必须通过对应业务工作区完成');

    expect(mockedApiRequest).not.toHaveBeenCalled();
  });

  it('continues to send the generic START request', async () => {
    mockedApiRequest.mockResolvedValue({ projectId: 'project-1' });

    await executeWorkflowAction('task-1', 'START', {
      comment: '开始处理',
    });

    expect(mockedApiRequest).toHaveBeenCalledWith(
      '/workflows/tasks/task-1/start',
      {
        method: 'POST',
        body: { comment: '开始处理' },
      },
    );
  });
});
