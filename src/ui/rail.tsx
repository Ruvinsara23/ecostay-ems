'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

// The icon-rail entry, shared by every console surface (AUDIT G: hand-rolled
// rails had drifted apart). Link and button variants share one look — the
// user-owned lavender/glass style lifted verbatim from the admin shell.

const entryClass = (active: boolean) =>
  `flex w-full flex-col items-center gap-1.5 py-2 transition-colors ${
    active ? 'text-brand' : 'text-ink-3 hover:text-ink'
  }`;

const iconClass = (active: boolean) =>
  `grid h-10 w-10 place-items-center rounded-2xl transition-colors ${
    active ? 'bg-brand text-white shadow-md' : 'bg-transparent text-current hover:bg-brand/10'
  }`;

export function RailLink({
  href,
  label,
  icon,
  active = false,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={entryClass(active)}
    >
      <span className={iconClass(active)}>{icon}</span>
      <span className="text-[11px] font-medium max-sm:hidden">{label}</span>
    </Link>
  );
}

export function RailButton({
  label,
  icon,
  onClick,
  active = false,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={entryClass(active)}
    >
      <span className={iconClass(active)}>{icon}</span>
      <span className="text-[11px] font-medium max-sm:hidden">{label}</span>
    </button>
  );
}
