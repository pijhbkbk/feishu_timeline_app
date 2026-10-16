import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '../../lib/auth-client';
import { fetchStandardBoardWorkspace } from '../../lib/standard-boards-client';
import { saveExistingProjectColorLink } from './existing-project-color-link';
import { ProjectColorPicker } from './project-color-picker';
vi.mock('../../lib/auth-client', () => ({ apiRequest: vi.fn(), ApiRequestError: class extends Error {} }));
vi.mock('../../lib/standard-boards-client', () => ({ fetchStandardBoardWorkspace: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
describe('existing project explicit association', () => {
  it('keeps existing-only selection from offering a new identity', () => {
    const html = renderToStaticMarkup(<ProjectColorPicker existingOnly disabled={false} value={{ colorMode: 'EXISTING', colorName: '', productionBaseId: '', existingColorId: '' }} onChange={() => undefined} />);
    expect(html).not.toContain('新建颜色');
    expect(html).toContain('生产基地');
    expect(html).toContain('先选择生产基地');
  });
  it('confirms save only after re-reading the same color and base from the project', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ projectId: 'project-a', colorId: 'color-a', productionBaseId: 'base-a' });
    const workspace = { project: { primaryColor: { id: 'color-a', productionBaseId: 'base-a' } } };
    vi.mocked(fetchStandardBoardWorkspace).mockResolvedValue(workspace as never);
    expect(await saveExistingProjectColorLink('project-a', { idempotencyKey: 'same-retry' })).toBe(workspace);
    expect(apiRequest).toHaveBeenCalledWith('/projects/project-a/color-link', expect.objectContaining({ method: 'POST', body: { idempotencyKey: 'same-retry' } }));
    expect(fetchStandardBoardWorkspace).toHaveBeenCalledWith('project-a');
  });
  it.each([{ id: 'color-other', productionBaseId: 'base-a' }, { id: 'color-a', productionBaseId: 'base-other' }, null])('does not announce success when the readback identity differs: %j', async primaryColor => {
    vi.mocked(apiRequest).mockResolvedValue({ projectId: 'project-a', colorId: 'color-a', productionBaseId: 'base-a' });
    vi.mocked(fetchStandardBoardWorkspace).mockResolvedValue({ project: { primaryColor } } as never);
    await expect(saveExistingProjectColorLink('project-a', {})).rejects.toThrow('尚未核对到同一颜色与基地');
  });
});
