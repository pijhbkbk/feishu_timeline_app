export function RealDataState({
  loading,
  error,
  label,
}: {
  loading: boolean;
  error: string | null;
  label: string;
}) {
  return (
    <div className="r26-page" data-testid={loading ? 'r26-real-loading' : 'r26-real-error'}>
      <section className="r26-real-state" role={error ? 'alert' : 'status'}>
        <span className={loading ? 'r26-real-state__spinner' : 'r26-real-state__error'} aria-hidden="true" />
        <strong>{error ? '真实数据暂时不可用' : label}</strong>
        <p>{error ?? '正在连接业务数据，请稍候。'}</p>
        {error ? (
          <button type="button" className="r26-button r26-button--primary" onClick={() => window.location.reload()}>
            重新读取
          </button>
        ) : null}
      </section>
    </div>
  );
}

export function formatV2ActivitySummary(
  summary: string | null | undefined,
  fallback: string,
) {
  if (!summary) return fallback;
  const normalized = summary.trim();
  if (normalized === 'Project created and workflow initialized automatically.') {
    return '项目创建后已自动初始化流程。';
  }
  const localized = normalized.replace(
    /\bWORK_EVIDENCE\b/gu,
    '工作证明材料',
  );
  if (/\b[A-Z][A-Z0-9_]{2,}\b/u.test(localized)) {
    return fallback;
  }
  return localized;
}
