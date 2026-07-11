'use client';

import { Building2, LayoutDashboard, LogOut, Users } from 'lucide-react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useAuth } from '@/auth/auth-context';
import { RequireAdmin } from '@/auth/require-admin';
import { RailButton, RailLink } from '@/ui/rail';

/**
 * Admin console shell (admin-console-v2 slice 01): one rail for every /admin
 * sub-route, so views are URL-addressable and deep-linkable. The guard lives
 * here — pages under /admin stay thin.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const { gateway } = useAuth();
  const pathname = usePathname() ?? '/admin';

  return (
    <RequireAdmin>
      {/* min-w-0: body is a flex column — without it this item inflates to its
          content's min-width on narrow screens and the right edge gets clipped. */}
      <div className="mx-auto flex min-h-screen w-full min-w-0 max-w-full bg-transparent max-sm:flex-col">
        <nav
          aria-label="Admin navigation"
          className="glass flex flex-none flex-col items-center gap-4 border-r border-hairline bg-white/80 p-3 sm:w-[90px] sm:py-6"
        >
          <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-brand/10 text-2xl font-extrabold text-brand">
            i
          </span>
          {/* Primary nav at the TOP (matches the owner rail's gravity); only Sign out sits at the bottom. */}
          <RailLink
            href="/admin"
            label="Properties"
            active={pathname === '/admin' || pathname.startsWith('/admin/properties')}
            icon={<Building2 size={22} strokeWidth={2.2} aria-hidden />}
          />
          <RailLink
            href="/admin/owners"
            label="Owners"
            active={pathname.startsWith('/admin/owners')}
            icon={<Users size={22} strokeWidth={2.2} aria-hidden />}
          />
          <RailLink
            href="/"
            label="Live rooms"
            icon={<LayoutDashboard size={22} strokeWidth={2.2} aria-hidden />}
          />
          <div className="mt-auto flex w-full flex-col gap-4">
            <RailButton
              label="Sign out"
              icon={<LogOut size={22} strokeWidth={2.2} aria-hidden />}
              onClick={() => gateway.signOut()}
            />
          </div>
        </nav>
        {children}
      </div>
    </RequireAdmin>
  );
}
