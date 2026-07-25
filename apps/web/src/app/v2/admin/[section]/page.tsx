import { notFound, redirect } from 'next/navigation';

import {
  AdminControlCenter,
  type AdminControlSection,
} from '../../../../components/admin-control-center';

type AdminSectionPageProps = {
  params: Promise<{ section: string }>;
};

const supportedSections = new Set<AdminControlSection>([
  'projects',
  'tasks',
  'organization',
  'assignments',
  'permissions',
  'workflow-templates',
  'dictionaries',
]);

const legacyRedirects: Record<string, string> = {
  users: 'organization',
  roles: 'permissions',
  dicts: 'dictionaries',
  'workflow-nodes': 'workflow-templates',
};

export default async function Page({ params }: AdminSectionPageProps) {
  const { section } = await params;
  if (legacyRedirects[section]) {
    redirect(`/admin/${legacyRedirects[section]}`);
  }
  if (!supportedSections.has(section as AdminControlSection)) {
    notFound();
  }
  return <AdminControlCenter section={section as AdminControlSection} />;
}
