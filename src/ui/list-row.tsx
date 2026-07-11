'use client';

import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * One row of a glass list (properties, rooms, owners): left title/subtitle,
 * right-hand slot, optional click-through with chevron.
 */
export function ListRow({
  title,
  subtitle,
  right,
  onClick,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="min-w-0">
        <span className="block truncate font-semibold text-ink">{title}</span>
        {subtitle && <span className="block text-xs text-ink-3">{subtitle}</span>}
      </span>
      <span className="flex min-w-0 items-center gap-3">
        {right}
        {onClick && <ChevronRight size={16} strokeWidth={2.2} className="shrink-0 text-ink-3" aria-hidden />}
      </span>
    </>
  );
  if (onClick) {
    return (
      <li>
        <button
          type="button"
          onClick={onClick}
          className="flex w-full items-center justify-between gap-3 py-4 text-left transition-colors hover:bg-brand-soft/40 first:pt-0 last:pb-0"
        >
          {body}
        </button>
      </li>
    );
  }
  return <li className="flex items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">{body}</li>;
}
