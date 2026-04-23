type FeedbackBannerProps = {
  variant?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  message: string;
  compact?: boolean;
};

export function FeedbackBanner({
  variant = 'info',
  title,
  message,
  compact = false,
}: FeedbackBannerProps) {
  return (
    <div
      className={`feedback-banner feedback-banner-${variant}${
        compact ? ' feedback-banner-compact' : ''
      }`}
      role={variant === 'error' ? 'alert' : 'status'}
    >
      {title ? <strong>{title}</strong> : null}
      <p>{message}</p>
    </div>
  );
}
