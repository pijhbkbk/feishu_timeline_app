export const MAX_PROGRESS_MATERIAL_ATTACHMENTS = 20;

export function selectProgressMaterialAttachmentIds(
  attachments: ReadonlyArray<{ id: string }>,
) {
  return attachments
    .slice(0, MAX_PROGRESS_MATERIAL_ATTACHMENTS)
    .map((attachment) => attachment.id);
}
