import { Suspense } from 'react';
import { M1Dashboard } from '../../features/m1/dashboard';
export default function DashboardPage() { return <Suspense fallback={<p role="status">正在加载工作台…</p>}><M1Dashboard /></Suspense>; }
