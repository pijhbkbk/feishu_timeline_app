import { AttachmentScanStatus } from '@prisma/client';

type ControlledColorNumberSource = {
  code: string | null;
  numberingTaskId: string | null;
  numberedById: string | null;
  numberedAt: Date | null;
  numberingAttachmentId: string | null;
  numberingAttachment: {
    scanStatus: AttachmentScanStatus;
    isDeleted: boolean;
  } | null;
};

/**
 * A color number is official only after step 05 completion stored the complete
 * provenance chain. Legacy/imported Color.code values must not leak into
 * business view models as confirmed color numbers.
 */
export function getControlledColorNumber(
  color: ControlledColorNumberSource | null | undefined,
): string | null {
  if (
    !color?.code ||
    !color.numberingTaskId ||
    !color.numberedById ||
    !color.numberedAt ||
    !color.numberingAttachmentId ||
    !color.numberingAttachment ||
    color.numberingAttachment.isDeleted ||
    color.numberingAttachment.scanStatus !== AttachmentScanStatus.CLEAN
  ) {
    return null;
  }

  return color.code;
}
