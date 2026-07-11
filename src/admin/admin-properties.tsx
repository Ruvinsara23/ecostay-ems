'use client';

import { Building2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import type { AdminPropertySummary } from '@/server/admin-directory';
import { TextField } from '@/ui/field';
import { usePageTitle } from '@/ui/use-page-title';
import { ListRow } from '@/ui/list-row';
import { useAdminOperations } from './admin-operations-context';

type PropertiesState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; properties: AdminPropertySummary[] };

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** Browse-first entry of the admin console: every property, with counts, one click to detail. */
export function AdminProperties() {
  const operations = useAdminOperations();
  const router = useRouter();
  usePageTitle('Properties');
  const [state, setState] = useState<PropertiesState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const [propertyId, setPropertyId] = useState('');
  const [propertyName, setPropertyName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [roomName, setRoomName] = useState('');
  const [formStatus, setFormStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [formError, setFormError] = useState<string | null>(null);

  function touched(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setFormStatus('idle');
      setFormError(null);
    };
  }

  async function handleRegister(event: FormEvent) {
    event.preventDefault();
    setFormStatus('saving');
    setFormError(null);
    try {
      const input: Parameters<typeof operations.registerRoom>[0] = {
        propertyId,
        roomId,
        roomName,
      };
      if (propertyName.trim()) input.propertyName = propertyName;
      await operations.registerRoom(input);
      setFormStatus('saved');
      setPropertyId('');
      setPropertyName('');
      setRoomId('');
      setRoomName('');
      setAttempt((n) => n + 1);
    } catch (error) {
      setFormStatus('error');
      setFormError(error instanceof Error ? error.message : 'Registration failed - try again.');
    }
  }

  useEffect(() => {
    let cancelled = false;
    operations.listProperties().then(
      (properties) => {
        if (!cancelled) setState({ status: 'ready', properties });
      },
      () => {
        if (!cancelled) setState({ status: 'error' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [operations, attempt]);

  return (
    <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-5 sm:p-8 lg:p-10">
      <div className="mx-auto w-full max-w-5xl">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
            Admin / Properties
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Properties</h1>
          <p className="mt-1 text-sm text-ink-2">
            Every registered property — open one to see its rooms, devices, and owners.
          </p>
        </div>

        <section className="glass mt-6 rounded-2xl p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-brand-soft text-brand">
              <Building2 size={18} strokeWidth={2.2} />
            </span>
            <h2 className="text-sm font-bold text-ink">All properties</h2>
          </div>

          {state.status === 'loading' ? (
            <p className="text-sm text-ink-2">Loading…</p>
          ) : state.status === 'error' ? (
            <div className="text-sm text-ink-2">
              <p role="alert">Couldn&apos;t load properties — check your connection and try again.</p>
              <button
                type="button"
                onClick={() => {
                  setState({ status: 'loading' });
                  setAttempt((n) => n + 1);
                }}
                className="mt-3 block rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-brand-deep"
              >
                Retry
              </button>
            </div>
          ) : state.properties.length === 0 ? (
            <p className="text-sm text-ink-2">
              No properties yet — register the first one below.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-hairline">
              {state.properties.map((property) => (
                <ListRow
                  key={property.propertyId}
                  title={property.name ?? property.propertyId}
                  subtitle={property.name ? property.propertyId : undefined}
                  right={
                    <span className="text-xs font-medium text-ink-2">
                      {count(property.roomCount, 'room')} · {count(property.ownerCount, 'owner')}
                    </span>
                  }
                  onClick={() => router.push(`/admin/properties/${property.propertyId}`)}
                />
              ))}
            </ul>
          )}

          <form
            onSubmit={handleRegister}
            className="mt-5 flex flex-col gap-4 border-t border-hairline pt-5"
          >
            <h3 className="text-sm font-bold text-ink">Register a property</h3>
            <p className="text-sm text-ink-2">
              A property is created with its first room; add more rooms from its detail page.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Property ID"
                value={propertyId}
                placeholder="property_002"
                onChange={touched(setPropertyId)}
              />
              <TextField
                label="Property name (optional)"
                value={propertyName}
                placeholder="Lagoon Villa"
                onChange={touched(setPropertyName)}
              />
              <TextField
                label="First room ID"
                value={roomId}
                placeholder="room_001"
                onChange={touched(setRoomId)}
              />
              <TextField
                label="First room name"
                value={roomName}
                placeholder="Garden Room"
                onChange={touched(setRoomName)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={formStatus === 'saving'}
                className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-brand-deep disabled:opacity-50"
              >
                <Plus size={16} strokeWidth={2.4} aria-hidden />
                {formStatus === 'saving' ? 'Registering…' : 'Register property'}
              </button>
              {formStatus === 'saved' && (
                <span className="text-sm font-semibold text-brand-deep">Property registered</span>
              )}
              {formStatus === 'error' && (
                <span role="alert" className="text-sm font-semibold text-alarm">
                  {formError ?? 'Could not register - try again.'}
                </span>
              )}
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
