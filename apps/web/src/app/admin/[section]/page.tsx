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
      eyebrow="系统管理"
      title={meta?.label ?? '系统管理'}
      description={meta?.description ?? '当前系统管理子页面已创建骨架。'}
      route={`/admin/${section}`}
      tags={['权限配置', '系统配置', meta?.label ?? '自定义页面']}
      actions={adminQuickLinks.map((key) => ({
        label: adminSectionMetaMap[key].label,
        href: buildAdminRoute(key),
      }))}
      emptyTitle={`${meta?.label ?? '系统管理'} 已创建骨架`}
      emptyDescription="当前页面已接入系统管理导航，后续按权限展示对应管理功能。"
    />
  );
}
