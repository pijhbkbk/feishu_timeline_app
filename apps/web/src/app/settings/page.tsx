import { PagePlaceholder } from '../../components/page-placeholder';

export default function SettingsPage() {
  return (
    <PagePlaceholder
      eyebrow="Legacy Route"
      title="设置"
      description="该全局路由保留兼容，系统配置入口优先收敛到 /admin/*。"
      route="/settings"
      actions={[{ label: '进入系统管理', href: '/admin/users' }]}
    />
  );
}
