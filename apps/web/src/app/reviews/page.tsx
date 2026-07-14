import { PagePlaceholder } from '../../components/page-placeholder';

export default function ReviewsPage() {
  return (
    <PagePlaceholder
      eyebrow="兼容路由"
      title="评审"
      description="该全局入口保留兼容，评审功能已归并到项目详情中的评审页签。"
      route="/reviews"
      actions={[{ label: '进入项目中心', href: '/projects' }]}
    />
  );
}
