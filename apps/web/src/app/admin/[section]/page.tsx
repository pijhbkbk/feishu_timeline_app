import { PagePlaceholder } from '../../../components/page-placeholder';
import {
  adminSectionMetaMap,
  buildAdminRoute,
  type AdminSectionKey,
} from '../../../lib/navigation';

type AdminSectionPageProps = {
  params: Promise<{
    section: string;
  }>;
};

const adminQuickLinks: AdminSectionKey[] = ['users', 'roles', 'dicts', 'workflow-nodes'];

export default async function AdminSectionPage({ params }: AdminSectionPageProps) {
  const { section } = await params;
  const sectionKey = section as AdminSectionKey;
  const meta = adminSectionMetaMap[sectionKey];

  return (
    <PagePlaceholder
      eyebrow="Administration"
      title={meta?.label ?? '系统管理'}
      description={meta?.description ?? '当前 admin 子页面已创建骨架。'}
      route={`/admin/${section}`}
      tags={['RBAC', 'System Config', meta?.key ?? 'custom-section']}
      actions={adminQuickLinks.map((key) => ({
        label: adminSectionMetaMap[key].label,
        href: buildAdminRoute(key),
      }))}
      emptyTitle={`${meta?.label ?? '系统管理'} 已创建骨架`}
      emptyDescription="当前页面先保证路由、导航和统一占位，后续再接真实管理功能。"
    />
  );
}
