'use client';

import { useParams } from 'next/navigation';
import { AdminPropertyDetail } from '@/admin/admin-property-detail';
import { RequireAdmin } from '@/auth/require-admin';

export default function PropertyDetailPage() {
  const params = useParams<{ pid: string }>();
  return (
    <RequireAdmin>
      <div className="mx-auto flex min-h-screen w-full bg-transparent">
        <AdminPropertyDetail propertyId={params.pid} />
      </div>
    </RequireAdmin>
  );
}
