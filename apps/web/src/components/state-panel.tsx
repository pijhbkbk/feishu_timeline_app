import type { PropsWithChildren, ReactNode } from 'react';

type StatePanelProps = PropsWithChildren<{
  variant?: 'empty' | 'error' | 'permission' | 'loading';
  title: string;
  description: string;
  actions?: ReactNode;
  compact?: boolean;
}>;

export function StatePanel({
  variant = 'empty',
  title,
  description,
  actions,
  compact = false,
  children,
}: StatePanelProps) {
  return (
    <div
      className={`state-panel state-panel-${variant}${compact ? ' state-panel-compact' : ''}`}
    >
      <div className="state-panel-copy">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {children}
      {actions ? <div className="state-panel-actions">{actions}</div> : null}
    </div>
  );
}
