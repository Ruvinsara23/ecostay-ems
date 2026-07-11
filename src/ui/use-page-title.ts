'use client';

import { useEffect } from 'react';

/** Client pages can't export `metadata` — set the tab title imperatively. */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · EcoStay EMS`;
  }, [title]);
}
