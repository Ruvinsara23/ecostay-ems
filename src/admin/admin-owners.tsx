'use client';

import { KeyRound, Power, UserPlus } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import type { OwnerSummary } from '@/server/admin-owners';
import { Badge } from '@/ui/badge';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { TextField } from '@/ui/field';
import { usePageTitle } from '@/ui/use-page-title';
import { useAdminOperations } from './admin-operations-context';

export function AdminOwners() {
  const operations = useAdminOperations();
  usePageTitle('Owners');
  const [owners, setOwners] = useState<OwnerSummary[] | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [resetLinks, setResetLinks] = useState<Record<string, string>>({});
  const [listError, setListError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [confirmDisable, setConfirmDisable] = useState<OwnerSummary | null>(null);

  const refresh = useCallback(async () => {
    setOwners(await operations.listOwners());
  }, [operations]);

  useEffect(() => {
    let cancelled = false;
    operations.listOwners().then(
      (list) => {
        if (!cancelled) {
          setListError(false);
          setOwners(list);
        }
      },
      () => {
        // A failed fetch must never masquerade as "no owners" (frontend audit A).
        if (!cancelled) setListError(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [operations, attempt]);

  function changed<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setStatus('idle');
      setError(null);
      setActionError(null);
    };
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setStatus('saving');
    setError(null);
    setActionError(null);
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
    setActionError(null);
    try {
      await operations.setOwnerDisabled(owner.uid, !owner.disabled);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update owner - try again.');
    } finally {
      setBusyUid(null);
    }
  }

  async function requestReset(owner: OwnerSummary) {
    setBusyUid(owner.uid);
    setActionError(null);
    setResetLinks((current) => {
      const next = { ...current };
      delete next[owner.uid];
      return next;
    });
    try {
      const { resetLink } = await operations.resetOwnerPassword(owner.email);
      setResetLinks((current) => ({ ...current, [owner.uid]: resetLink }));
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Could not reset owner password - try again.',
      );
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
          {actionError && (
            <p role="alert" className="mb-4 text-sm font-semibold text-alarm">
              {actionError}
            </p>
          )}
          {listError ? (
            <div className="text-sm text-ink-2">
              <p role="alert">Couldn&apos;t load owners — check your connection and try again.</p>
              <button
                type="button"
                onClick={() => {
                  setListError(false);
                  setOwners(null);
                  setAttempt((n) => n + 1);
                }}
                className="mt-3 block rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-brand-deep"
              >
                Retry
              </button>
            </div>
          ) : owners === null ? (
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
                      {owner.disabled && <Badge tone="danger">Disabled</Badge>}
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
                      onClick={() =>
                        owner.disabled ? toggleDisabled(owner) : setConfirmDisable(owner)
                      }
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

        <ConfirmDialog
          open={confirmDisable !== null}
          title="Disable this owner?"
          body={`${confirmDisable?.email ?? ''} will be signed out and unable to log in until re-enabled.`}
          confirmLabel="Disable owner"
          onCancel={() => setConfirmDisable(null)}
          onConfirm={() => {
            const target = confirmDisable;
            setConfirmDisable(null);
            if (target) toggleDisabled(target);
          }}
        />
      </div>
    </main>
  );
}
