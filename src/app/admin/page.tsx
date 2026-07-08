'use client';

import { ArrowLeft, Settings } from 'lucide-react';
import Link from 'next/link';
import { AdminSettings } from '@/admin/admin-settings';
import { RequireAdmin } from '@/auth/require-admin';

export default function AdminPage() {
  return (
    <RequireAdmin>
      <div className="mx-auto flex min-h-screen w-full bg-transparent max-sm:flex-col">
        <nav
          aria-label="Admin navigation"
          className="glass flex flex-none flex-col items-center gap-4 border-r border-hairline bg-white/80 p-3 sm:w-[90px] sm:py-6"
        >
          <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-brand/10 text-2xl font-extrabold text-brand">
            i
          </span>
          <Link
            href="/"
            title="Dashboard"
            aria-label="Dashboard"
            className="flex w-full flex-col items-center gap-1.5 py-2 text-ink-3 transition-colors hover:text-ink"
          >
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-transparent text-current transition-colors hover:bg-brand/10">
              <ArrowLeft size={22} strokeWidth={2.2} aria-hidden />
            </span>
            <span className="text-[11px] font-medium max-sm:hidden">Dashboard</span>
          </Link>
          <div className="mt-auto w-full">
            <div
              aria-current="page"
              className="flex w-full flex-col items-center gap-1.5 py-2 text-brand"
            >
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand text-white shadow-md">
                <Settings size={22} strokeWidth={2.2} aria-hidden />
              </span>
              <span className="text-[11px] font-medium max-sm:hidden">Settings</span>
            </div>
          </div>
        </nav>
        <AdminSettings />
      </div>
    </RequireAdmin>
  );
}
