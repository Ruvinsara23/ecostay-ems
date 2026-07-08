'use client';

import { KeyRound, Power, UserPlus } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import type { OwnerSummary } from '@/server/admin-owners';
import { useAdminOperations } from './admin-operations-context';

const fieldClass =
  'box-border w-full min-w-0 rounded-xl border border-hairline bg-white/70 px-3.5 py-2.5 font-normal text-ink outline-none transition focus:ring-2 focus:ring-brand';

function TextField({
  label,
  type = 'text',
  value,
  placeholder,
  onChange,
}: {
  label: string;
  type?: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold text-ink">
      {label}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={fieldClass}
      />
    </label>
  );
}

export function AdminOwners() {
  const operations = useAdminOperations();
  const [owners, setOwners] = useState<OwnerSummary[] | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [resetLinks, setResetLinks] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setOwners(await operations.listOwners());
  }, [operations]);

  useEffect(() => {
    let cancelled = false;
    operations.listOwners().then(
      (list) => {
        if (!cancelled) setOwners(list);
      },
      () => {
        if (!cancelled) setOwners([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [operations]);

  function changed<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setStatus('idle');
      setError(null);
    };
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setStatus('saving');
    setError(null);
    try {
      await operations.createOwner({ email, password, propertyId });
      setStatus('saved');
      setEmail('');
      setPassword('');
      // Keep propertyId so the admin can add several owners to the same property.
      await refresh();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Could not create owner - try again.');
    }
  }

  async function toggleDisabled(owner: OwnerSummary) {
    setBusyUid(owner.uid);
    try {
      await operations.setOwnerDisabled(owner.uid, !owner.disabled);
      await refresh();
    } finally {
      setBusyUid(null);
    }
  }

  async function requestReset(owner: OwnerSummary) {
    setBusyUid(owner.uid);
    try {
      const { resetLink } = await operations.resetOwnerPassword(owner.email);
      setResetLinks((current) => ({ ...current, [owner.uid]: resetLink }));
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-5 sm:p-8 lg:p-10">
      <div className="mx-auto w-full max-w-5xl">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
            Admin / Owners
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Owner accounts</h1>
          <p className="mt-1 text-sm text-ink-2">
            Create an owner login and assign it to a property, or disable/reset an existing one.
          </p>
        </div>

        <form
          onSubmit={handleCreate}
          className="glass box-border mt-6 flex w-full max-w-full flex-col gap-6 rounded-2xl p-5 sm:p-6"
        >
          <div className="mb-1 flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-brand-soft text-brand">
              <UserPlus size={18} strokeWidth={2.2} />
            </span>
            <h2 className="text-sm font-bold text-ink">Create owner</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Email"
              type="email"
              value={email}
              placeholder="owner@villa.lk"
              onChange={changed(setEmail)}
            />
            <TextField
              label="Temporary password"
              type="password"
              value={password}
              placeholder="At least 8 characters"
              onChange={changed(setPassword)}
            />
            <TextField
              label="Property ID"
              value={propertyId}
              placeholder="property_001"
              onChange={changed(setPropertyId)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-5">
            <button
              type="submit"
              disabled={status === 'saving'}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-brand-deep disabled:opacity-50"
            >
              <UserPlus size={16} strokeWidth={2.4} aria-hidden />
              {status === 'saving' ? 'Creating...' : 'Create owner'}
            </button>
            {status === 'saved' && (
              <span className="text-sm font-semibold text-brand-deep">Owner created</span>
            )}
            {status === 'error' && (
              <span role="alert" className="text-sm font-semibold text-alarm">
                {error ?? 'Could not create - try again.'}
              </span>
            )}
          </div>
        </form>

        <section className="glass mt-6 rounded-2xl p-5 sm:p-6">
          <h2 className="mb-4 text-sm font-bold text-ink">Existing owners</h2>
          {owners === null ? (
            <p className="text-sm text-ink-2">Loading...</p>
          ) : owners.length === 0 ? (
            <p className="text-sm text-ink-2">No owner accounts yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-hairline">
              {owners.map((owner) => (
                <li
                  key={owner.uid}
                  className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-ink">{owner.email}</span>
                      {owner.disabled && (
                        <span className="rounded-full bg-alarm/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-alarm">
                          Disabled
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {owner.propertyIds.length === 0 ? (
                        <span className="text-xs text-ink-3">No property assigned</span>
                      ) : (
                        owner.propertyIds.map((pid) => (
                          <span
                            key={pid}
                            className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand"
                          >
                            {pid}
                          </span>
                        ))
                      )}
                    </div>
                    {resetLinks[owner.uid] && (
                      <a
                        href={resetLinks[owner.uid]}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block break-all text-xs font-semibold text-brand underline"
                      >
                        Reset link — send to the owner
                      </a>
                    )}
                  </div>
                  <div className="flex flex-none flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyUid === owner.uid}
                      onClick={() => toggleDisabled(owner)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white/70 px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:bg-white disabled:opacity-50"
                    >
                      <Power size={15} strokeWidth={2.2} aria-hidden />
                      {owner.disabled ? 'Enable' : 'Disable'}
                    </button>
                    <button
                      type="button"
                      disabled={busyUid === owner.uid}
                      onClick={() => requestReset(owner)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white/70 px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:bg-white disabled:opacity-50"
                    >
                      <KeyRound size={15} strokeWidth={2.2} aria-hidden />
                      Reset password
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
