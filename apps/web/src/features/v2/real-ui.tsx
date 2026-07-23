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
        <p>{error ?? '正在通过只读 GET 接口连接独立 staging 数据。'}</p>
        {error ? (
          <button type="button" className="r26-button r26-button--primary" onClick={() => window.location.reload()}>
            重新读取
          </button>
        ) : null}
      </section>
    </div>
  );
}
