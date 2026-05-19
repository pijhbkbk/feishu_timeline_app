import { PagePlaceholder } from '../../components/page-placeholder';

export default function SettingsPage() {
  return (
    <PagePlaceholder
      eyebrow="兼容路由"
      title="设置"
      description="该全局入口保留兼容，系统配置功能统一收敛到系统管理模块。"
      route="/settings"
      actions={[{ label: '进入系统管理', href: '/admin/users' }]}
    />
  );
}
