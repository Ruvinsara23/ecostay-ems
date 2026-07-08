'use client';

import { DoorOpen, Plus } from 'lucide-react';
import { FormEvent, useState } from 'react';
import type { RegisterRoomInput } from '@/server/register-room';
import { useAdminOperations } from './admin-operations-context';

const fieldClass =
  'box-border w-full min-w-0 rounded-xl border border-hairline bg-white/70 px-3.5 py-2.5 font-normal text-ink outline-none transition focus:ring-2 focus:ring-brand';

function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold text-ink">
      {label}
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={fieldClass}
      />
    </label>
  );
}

export function AdminRooms() {
  const operations = useAdminOperations();
  const [propertyId, setPropertyId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [roomName, setRoomName] = useState('');
  const [propertyName, setPropertyName] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  function change<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setStatus('idle');
      setError(null);
    };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus('saving');
    setError(null);
    const input: RegisterRoomInput = { propertyId, roomId, roomName };
    if (propertyName.trim()) input.propertyName = propertyName;
    try {
      await operations.registerRoom(input);
      setStatus('saved');
      // Keep the property so the admin can add more rooms to it; clear the room fields.
      setRoomId('');
      setRoomName('');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Registration failed - try again.');
    }
  }

  return (
    <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-5 sm:p-8 lg:p-10">
      <div className="mx-auto w-full max-w-5xl">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
            Admin / Rooms
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Register a room</h1>
          <p className="mt-1 text-sm text-ink-2">
            Add a room to a property so it appears on the dashboard and gets sampled. Device
            provisioning stays on the firmware side.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="glass box-border mt-6 flex w-full max-w-full flex-col gap-6 rounded-2xl p-5 sm:p-6"
        >
          <div className="mb-1 flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-brand-soft text-brand">
              <DoorOpen size={18} strokeWidth={2.2} />
            </span>
            <h2 className="text-sm font-bold text-ink">Room details</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Property ID"
              value={propertyId}
              placeholder="property_001"
              onChange={change(setPropertyId)}
            />
            <TextField
              label="Property name (optional)"
              value={propertyName}
              placeholder="Lagoon Villa"
              onChange={change(setPropertyName)}
            />
            <TextField
              label="Room ID"
              value={roomId}
              placeholder="room_001"
              onChange={change(setRoomId)}
            />
            <TextField
              label="Room name"
              value={roomName}
              placeholder="Garden Room"
              onChange={change(setRoomName)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-5">
            <button
              type="submit"
              disabled={status === 'saving'}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-brand-deep disabled:opacity-50"
            >
              <Plus size={16} strokeWidth={2.4} aria-hidden />
              {status === 'saving' ? 'Registering...' : 'Register room'}
            </button>
            {status === 'saved' && (
              <span className="text-sm font-semibold text-brand-deep">Room registered</span>
            )}
            {status === 'error' && (
              <span role="alert" className="text-sm font-semibold text-alarm">
                {error ?? 'Could not register - try again.'}
              </span>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}
