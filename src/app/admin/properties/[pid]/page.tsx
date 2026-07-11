'use client';

import { useParams } from 'next/navigation';
import { AdminPropertyDetail } from '@/admin/admin-property-detail';

export default function PropertyDetailPage() {
  const params = useParams<{ pid: string }>();
  // key: full remount per property — mutation state (shown-once credentials,
  // form banners) must never survive a property switch (review finding).
  return <AdminPropertyDetail key={params.pid} propertyId={params.pid} />;
}
