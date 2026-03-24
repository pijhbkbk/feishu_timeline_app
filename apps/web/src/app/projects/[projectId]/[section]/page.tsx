import { PagePlaceholder } from '../../../../components/page-placeholder';
import {
  buildProjectRoute,
  projectSectionMetaMap,
  type ProjectSectionKey,
} from '../../../../lib/navigation';

type ProjectSectionPageProps = {
  params: Promise<{
    projectId: string;
    section: string;
  }>;
};

const projectQuickLinks: ProjectSectionKey[] = [
  'overview',
  'workflow',
  'reviews',
  'attachments',
  'logs',
];

export default async function ProjectSectionPage({ params }: ProjectSectionPageProps) {
  const { projectId, section } = await params;
  const sectionKey = (section as ProjectSectionKey) || 'overview';
  const meta = projectSectionMetaMap[sectionKey];

  return (
    <PagePlaceholder
      eyebrow="Project Workspace"
      title={meta?.label ?? '项目工作区'}
      description={
        meta?.description ??
        '当前项目子页面已预留路由和导航，后续会接入对应业务模块。'
      }
      route={`/projects/${projectId}/${section}`}
      tags={[`Project: ${projectId}`, meta?.key ?? 'custom-section', 'Empty State']}
      actions={projectQuickLinks.map((key) => ({
        label: projectSectionMetaMap[key].label,
        href: buildProjectRoute(projectId, key),
      }))}
      emptyTitle={`${projectId} / ${meta?.label ?? '项目工作区'} 已创建骨架`}
      emptyDescription="当前页面统一使用项目级导航和空状态占位，后续按模块逐步接入接口与表单。"
    />
  );
}
