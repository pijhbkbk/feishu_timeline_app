import { PagePlaceholder } from '../../components/page-placeholder';

export default function ColorsPage() {
  return (
    <PagePlaceholder
      eyebrow="Colors"
      title="颜色管理"
      description="这里后续会承载颜色主数据、颜色版本、编号和状态跟踪。"
      route="/colors"
      tags={['颜色主数据', '颜色版本', '颜色取号']}
      actions={[
        { label: '进入项目中心', href: '/projects' },
        { label: '查看示例项目颜色评价', href: '/projects/DEMO-001/color-evaluation' },
      ]}
    />
  );
}
