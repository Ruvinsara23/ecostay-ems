'use client';

import { ArrowLeft, DoorOpen, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { AdminOwners } from '@/admin/admin-owners';
import { AdminRooms } from '@/admin/admin-rooms';
import { AdminSettings } from '@/admin/admin-settings';
import { RequireAdmin } from '@/auth/require-admin';

type AdminView = 'settings' | 'rooms' | 'owners';

function RailButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex w-full flex-col items-center gap-1.5 py-2 transition-colors ${
        active ? 'text-brand' : 'text-ink-3 hover:text-ink'
      }`}
    >
      <span
        className={`grid h-10 w-10 place-items-center rounded-2xl transition-colors ${
          active ? 'bg-brand text-white shadow-md' : 'bg-transparent text-current hover:bg-brand/10'
        }`}
      >
        {children}
      </span>
      <span className="text-[11px] font-medium max-sm:hidden">{label}</span>
    </button>
  );
}

export default function AdminPage() {
  const [view, setView] = useState<AdminView>('settings');

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
          <div className="mt-auto flex w-full flex-col gap-4">
            <RailButton label="Owners" active={view === 'owners'} onClick={() => setView('owners')}>
              <Users size={22} strokeWidth={2.2} aria-hidden />
            </RailButton>
            <RailButton label="Rooms" active={view === 'rooms'} onClick={() => setView('rooms')}>
              <DoorOpen size={22} strokeWidth={2.2} aria-hidden />
            </RailButton>
            <RailButton
              label="Settings"
              active={view === 'settings'}
              onClick={() => setView('settings')}
            >
              <Settings size={22} strokeWidth={2.2} aria-hidden />
            </RailButton>
          </div>
        </nav>
        {view === 'settings' ? (
          <AdminSettings />
        ) : view === 'rooms' ? (
          <AdminRooms />
        ) : (
          <AdminOwners />
        )}
      </div>
    </RequireAdmin>
  );
}
