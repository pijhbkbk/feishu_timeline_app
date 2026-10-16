import React from 'react';
import { ArrowLeftIcon, CheckIcon, ChevronRightIcon, CloseIcon, HomeIcon, ProjectIcon, ResetIcon, TaskIcon, UploadIcon, ZoomInIcon, ZoomOutIcon } from '../v2/icons';
const icons = { back: ArrowLeftIcon, check: CheckIcon, next: ChevronRightIcon, close: CloseIcon, home: HomeIcon, project: ProjectIcon, refresh: ResetIcon, file: TaskIcon, upload: UploadIcon, zoomIn: ZoomInIcon, zoomOut: ZoomOutIcon };
export function M1Icon({ name, size = 20 }: { name: keyof typeof icons; size?: 16 | 20 | 24 }) {
  const Icon = icons[name];
  return <Icon width={size} height={size} className="m1-icon" focusable="false" />;
}
