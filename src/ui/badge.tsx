'use client';

import type { ReactNode } from 'react';

// One status chip for both surfaces (UI audit E): tone tokens only, no raw colors.
const TONES = {
  brand: 'bg-brand-soft text-brand-deep',
  success: 'bg-success-soft text-success',
  warn: 'bg-warnbrand-soft text-warnbrand',
  danger: 'bg-alarm-soft text-alarm',
  neutral: 'bg-well text-ink-3',
} as const;

export function Badge({
  tone,
  children,
}: {
  tone: keyof typeof TONES;
  children: ReactNode;
}) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
