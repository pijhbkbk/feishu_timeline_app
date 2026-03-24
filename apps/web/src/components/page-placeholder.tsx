import Link from 'next/link';

type PagePlaceholderProps = {
  eyebrow?: string;
  title: string;
  description: string;
  route?: string;
  tags?: string[];
  actions?: Array<{
    label: string;
    href: string;
  }>;
  emptyTitle?: string;
  emptyDescription?: string;
};

export function PagePlaceholder({
  eyebrow = 'Route Placeholder',
  title,
  description,
  route,
  tags,
  actions,
  emptyTitle = '页面骨架已就位',
  emptyDescription = '当前先提供统一布局、导航和空状态占位，后续再填充业务组件与接口数据。',
}: PagePlaceholderProps) {
  return (
    <section className="page-card">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
      {route ? <p className="route-label">{route}</p> : null}
      {tags && tags.length > 0 ? (
        <div className="tag-row">
          {tags.map((tag) => (
            <span key={tag} className="tag-chip">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      {actions && actions.length > 0 ? (
        <div className="page-actions">
          {actions.map((action) => (
            <Link key={action.href} href={action.href} className="button button-secondary">
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
      <div className="placeholder-empty">
        <strong>{emptyTitle}</strong>
        <p>{emptyDescription}</p>
      </div>
    </section>
  );
}
