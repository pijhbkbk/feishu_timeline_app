import { PagePlaceholder } from '../../components/page-placeholder';

export default function ReviewsPage() {
  return (
    <PagePlaceholder
      eyebrow="兼容路由"
      title="评审"
      description="该全局入口保留兼容，评审功能已归并到项目详情中的评审页签。"
      route="/reviews"
      actions={[{ label: '查看示例项目评审', href: '/projects/DEMO-001/reviews' }]}
    />
  );
}
