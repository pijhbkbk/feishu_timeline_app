import { Suspense } from 'react';

import { MaterialsUploadR22 } from '../../../components/materials-upload-r22';

export default function MaterialsUploadPage() {
  return <Suspense fallback={<div className="r22-card r22-skeleton-card" />}><MaterialsUploadR22 /></Suspense>;
}
