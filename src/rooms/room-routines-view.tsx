'use client';

import { useEffect, useState } from 'react';
import { useRoomDataSource } from './room-data-source-context';
import { Toggle } from '@/ui/toggle';

export function RoomRoutinesView({
  propertyId,
  roomId,
  roomName,
}: {
  propertyId: string;
  roomId: string;
  roomName?: string;
}) {
  const source = useRoomDataSource();
  const [automationEnabled, setAutomationEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const unsub = source.subscribeAutomationEnabled(propertyId, roomId, (enabled) => {
      if (active) setAutomationEnabled(enabled ?? false);
    });
    return () => {
      active = false;
      unsub();
    };
  }, [source, propertyId, roomId]);

  const toggleAutomation = () => {
    if (automationEnabled === null) return;
    setError(null);
    const next = !automationEnabled;
    // Optimistic update
    setAutomationEnabled(next);
    source.setAutomationEnabled(propertyId, roomId, next).catch((e: Error | unknown) => {
      setAutomationEnabled(!next);
      setError(e instanceof Error ? e.message : 'Failed to update automation');
    });
  };

  return (
    <section aria-label={`Routines in ${roomName ?? roomId}`} className="relative h-full w-full overflow-hidden bg-transparent">
      {/* Background decoration */}
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-brand/5 to-transparent opacity-50" />

      <div className="absolute left-1/2 top-4 -translate-x-1/2 z-10 pointer-events-none flex flex-col items-center gap-1">
        <span className="text-sm font-bold tracking-tight text-ink">{roomName ?? roomId}</span>
        <span className="text-[11px] font-medium text-ink-3">Routines & Automations</span>
      </div>

      <div className="relative z-10 flex h-full flex-col p-6 pt-24 overflow-y-auto">
        <div className="mx-auto w-full max-w-lg">
          <h2 className="mb-6 text-xl font-bold tracking-tight text-ink">Active Routines</h2>
          
          <div className="glass rounded-[1.25rem] p-6 shadow-lg bg-white/60">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-ink">Vacancy Cutoff</h3>
                <p className="mt-1 text-sm text-ink-3">
                  Automatically turns off lights and fan when the room is confirmed vacant to save energy.
                </p>
                {error && (
                  <p role="alert" className="mt-3 text-xs font-semibold text-alarm">
                    {error}
                  </p>
                )}
              </div>
              <div className="pt-1">
                <Toggle
                  checked={automationEnabled === true}
                  disabled={automationEnabled === null}
                  label="Vacancy cutoff automation"
                  onToggle={toggleAutomation}
                />
              </div>
            </div>
          </div>
          
          <div className="mt-6 rounded-xl border border-dashed border-ink-3/20 p-6 text-center">
            <svg className="mx-auto mb-2 text-ink-3/40" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <p className="text-sm font-medium text-ink-2">Time-of-Use and Scheduled Automations</p>
            <p className="mt-1 text-xs text-ink-3">Coming soon in future updates.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
