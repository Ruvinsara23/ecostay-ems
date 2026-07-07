'use client';

import Link from 'next/link';
import { RequireAdmin } from '@/auth/require-admin';
import { AdminSettings } from '@/admin/admin-settings';

export default function AdminPage() {
  return (
    <RequireAdmin>
      <div className="min-h-screen">
        <div className="mx-auto max-w-lg px-6 pt-6 sm:px-10">
          <Link href="/" className="text-sm font-semibold text-ink-2 hover:text-ink">
            ← Back to dashboard
          </Link>
        </div>
        <AdminSettings />
      </div>
    </RequireAdmin>
  );
}
