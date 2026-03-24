import { PagePlaceholder } from '../../components/page-placeholder';

export default function ReviewsPage() {
  return (
    <PagePlaceholder
      eyebrow="Legacy Route"
      title="评审"
      description="该全局路由保留兼容，占位功能已归并到项目级 /projects/[projectId]/reviews。"
      route="/reviews"
      actions={[{ label: '查看示例项目评审', href: '/projects/DEMO-001/reviews' }]}
    />
  );
}
