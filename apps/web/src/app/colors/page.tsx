import { redirect } from 'next/navigation';

export default async function ColorsPage({ searchParams }: { searchParams: Promise<{ colorId?: string | string[] }> }) {
  const { colorId } = await searchParams;
  if (typeof colorId === 'string' && colorId.length > 0 && colorId.length <= 100) {
    redirect(`/admin/color-database?view=records&colorId=${encodeURIComponent(colorId)}`);
  }
  redirect('/admin/color-database');
}
