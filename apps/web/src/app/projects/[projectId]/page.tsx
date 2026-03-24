import { redirect } from 'next/navigation';

type ProjectIndexPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectIndexPage({ params }: ProjectIndexPageProps) {
  const { projectId } = await params;

  redirect(`/projects/${projectId}/overview`);
}
