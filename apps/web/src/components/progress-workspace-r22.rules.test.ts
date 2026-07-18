import { describe, expect, it } from 'vitest';

import {
  MAX_PROGRESS_MATERIAL_ATTACHMENTS,
  selectProgressMaterialAttachmentIds,
} from './progress-workspace-r22.rules';

describe('progress workspace rules', () => {
  it('references only the most recent 20 task attachments in one progress update', () => {
    const attachments = Array.from({ length: 21 }, (_, index) => ({ id: `attachment-${index + 1}` }));

    expect(selectProgressMaterialAttachmentIds(attachments)).toEqual(
      attachments.slice(0, MAX_PROGRESS_MATERIAL_ATTACHMENTS).map((attachment) => attachment.id),
    );
    expect(attachments).toHaveLength(21);
  });
});
