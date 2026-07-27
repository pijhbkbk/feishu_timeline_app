import { notFound, redirect } from 'next/navigation';

import {
  AdminControlCenter,
  type AdminControlSection,
} from '../../../components/admin-control-center';

type AdminSectionPageProps = {
  params: Promise<{ section: string }>;
};

const supportedSections = new Set<AdminControlSection>([
  'projects',
  'tasks',
  'organization',
  'assignments',
  'permissions',
]);

const legacyRedirects: Record<string, string> = {
  users: 'organization',
  roles: 'permissions',
};

export default async function AdminSectionPage({
  params,
}: AdminSectionPageProps) {
  const { section } = await params;
  if (legacyRedirects[section]) {
    redirect(`/admin/${legacyRedirects[section]}`);
  }
  if (!supportedSections.has(section as AdminControlSection)) {
    notFound();
  }
  return <AdminControlCenter section={section as AdminControlSection} />;
}
