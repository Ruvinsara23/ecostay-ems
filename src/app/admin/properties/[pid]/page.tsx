'use client';

import { useParams } from 'next/navigation';
import { AdminPropertyDetail } from '@/admin/admin-property-detail';

export default function PropertyDetailPage() {
  const params = useParams<{ pid: string }>();
  return <AdminPropertyDetail propertyId={params.pid} />;
}
