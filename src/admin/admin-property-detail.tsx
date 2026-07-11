'use client';

import { ArrowLeft, Cpu, DoorOpen, KeyRound, Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import type { AdminRoomSummary } from '@/server/admin-directory';
import type { OwnerSummary } from '@/server/admin-owners';
import type { DeviceCredential } from '@/server/manage-device';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { TextField } from '@/ui/field';
import { Badge } from '@/ui/badge';
import { ListRow } from '@/ui/list-row';
import { usePageTitle } from '@/ui/use-page-title';
import { AlertCenter } from '@/rooms/alert-center';
import { useAdminOperations } from './admin-operations-context';
import { AdminPropertySettings } from './admin-property-settings';

type RoomsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rooms: AdminRoomSummary[] };

type OwnersState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; owners: OwnerSummary[] };

function DeviceStatus({ room }: { room: AdminRoomSummary }) {
  return (
    <span className="flex min-w-0 max-w-full flex-col items-start gap-1 text-left sm:items-end sm:text-right">
      {room.deviceAccountEmail ? (
        <span className="flex min-w-0 max-w-full items-center gap-1.5 text-xs font-medium text-brand-deep">
          <Cpu size={13} strokeWidth={2.2} aria-hidden className="shrink-0" />
          <span className="min-w-0 font-mono [overflow-wrap:anywhere]">
            {room.deviceAccountEmail}
          </span>
        </span>
      ) : (
        <span className="text-xs font-medium text-ink-3">No device account</span>
      )}
      <span className="text-xs text-ink-3">
        {room.lastSeenAt
          ? `Last seen ${new Date(room.lastSeenAt).toLocaleString()}`
          : 'Never reported'}
      </span>
    </span>
  );
}

/**
 * One property's rooms with device accounts and inline admin actions
 * (admin-console-v2 slices 04+05): register a room, create/reset the room's
 * device credential — the property id always comes from the route, never a
 * free-text box. Credentials are shown once and never persisted client-side.
 */
export function AdminPropertyDetail({ propertyId }: { propertyId: string }) {
  const operations = useAdminOperations();
  usePageTitle(propertyId);
  const [state, setState] = useState<RoomsState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const [roomId, setRoomId] = useState('');
  const [roomName, setRoomName] = useState('');
  const [propertyName, setPropertyName] = useState('');
  const [formStatus, setFormStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [formError, setFormError] = useState<string | null>(null);

  const [deviceBusyRoom, setDeviceBusyRoom] = useState<string | null>(null);
  const [deviceError, setDeviceError] = useState<{ roomId: string; message: string } | null>(null);
  const [credential, setCredential] = useState<{ roomId: string; value: DeviceCredential } | null>(
    null,
  );
  const [confirmResetRoom, setConfirmResetRoom] = useState<string | null>(null);

  const [ownersState, setOwnersState] = useState<OwnersState>({ status: 'loading' });
  const [ownersAttempt, setOwnersAttempt] = useState(0);
  const [assignUid, setAssignUid] = useState('');
  const [ownerBusy, setOwnerBusy] = useState(false);
  const [ownerActionError, setOwnerActionError] = useState<string | null>(null);
  const [confirmRemoveOwner, setConfirmRemoveOwner] = useState<OwnerSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    operations.listRooms(propertyId).then(
      (rooms) => {
        if (!cancelled) setState({ status: 'ready', rooms });
      },
      () => {
        if (!cancelled) setState({ status: 'error' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [operations, propertyId, attempt]);

  useEffect(() => {
    let cancelled = false;
    operations.listOwners().then(
      (owners) => {
        if (!cancelled) setOwnersState({ status: 'ready', owners });
      },
      () => {
        if (!cancelled) setOwnersState({ status: 'error' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [operations, ownersAttempt]);

  const refresh = () => setAttempt((n) => n + 1);

  async function runOwnerAction(action: () => Promise<void>) {
    setOwnerBusy(true);
    setOwnerActionError(null);
    try {
      await action();
      setAssignUid('');
      setOwnersAttempt((n) => n + 1);
    } catch (error) {
      setOwnerActionError(
        error instanceof Error ? error.message : 'Could not update access - try again.',
      );
    } finally {
      setOwnerBusy(false);
    }
  }

  async function handleRegister(event: FormEvent) {
    event.preventDefault();
    setFormStatus('saving');
    setFormError(null);
    setCredential(null);
    setDeviceError(null);
    try {
      const input: Parameters<typeof operations.registerRoom>[0] = {
        propertyId,
        roomId,
        roomName,
      };
      if (propertyName.trim()) input.propertyName = propertyName;
      await operations.registerRoom(input);
      setFormStatus('saved');
      setRoomId('');
      setRoomName('');
      refresh();
    } catch (error) {
      setFormStatus('error');
      setFormError(error instanceof Error ? error.message : 'Registration failed - try again.');
    }
  }

  async function provisionDevice(targetRoomId: string, action: 'create' | 'reset') {
    setDeviceBusyRoom(targetRoomId);
    setDeviceError(null);
    setCredential(null);
    try {
      const input = { propertyId, roomId: targetRoomId };
      const value =
        action === 'create'
          ? await operations.createDeviceAccount(input)
          : await operations.resetDeviceCredential(input);
      setCredential({ roomId: targetRoomId, value });
      refresh();
    } catch (error) {
      setDeviceError({
        roomId: targetRoomId,
        message: error instanceof Error ? error.message : 'Could not save - try again.',
      });
    } finally {
      setDeviceBusyRoom(null);
    }
  }

  return (
    <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-5 sm:p-8 lg:p-10">
      <div className="mx-auto w-full max-w-5xl">
        <Link
          href="/admin/properties"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-3 transition-colors hover:text-ink"
        >
          <ArrowLeft size={16} strokeWidth={2.2} aria-hidden />
          Back to Properties
        </Link>

        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
            Admin / Properties / {propertyId}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">{propertyId}</h1>
          <p className="mt-1 text-sm text-ink-2">
            Rooms in this property with their device accounts — register rooms and manage
            credentials right here.
          </p>
        </div>

        <section className="glass mt-6 rounded-2xl p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-brand-soft text-brand">
              <DoorOpen size={18} strokeWidth={2.2} />
            </span>
            <h2 className="text-sm font-bold text-ink">Rooms &amp; devices</h2>
          </div>

          {state.status === 'loading' ? (
            <p className="text-sm text-ink-2">Loading…</p>
          ) : state.status === 'error' ? (
            <div className="text-sm text-ink-2">
              <p role="alert">Couldn&apos;t load rooms — check your connection and try again.</p>
              <button
                type="button"
                onClick={() => {
                  setState({ status: 'loading' });
                  refresh();
                }}
                className="mt-3 block rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-brand-deep"
              >
                Retry
              </button>
            </div>
          ) : state.rooms.length === 0 ? (
            <p className="text-sm text-ink-2">
              No rooms registered for this property yet — add the first one below.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-hairline">
              {state.rooms.map((room) => (
                <li key={room.roomId} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ink">
                        {room.roomName ?? room.roomId}
                      </span>
                      {room.roomName && (
                        <span className="block text-xs text-ink-3">{room.roomId}</span>
                      )}
                    </span>
                    <span className="flex min-w-0 flex-wrap items-center gap-3 sm:justify-end">
                      <Link
                        href={`/?pid=${encodeURIComponent(propertyId)}&rid=${encodeURIComponent(room.roomId)}`}
                        className="shrink-0 text-xs font-semibold text-brand transition-colors hover:text-brand-deep"
                      >
                        View live →
                      </Link>
                      <DeviceStatus room={room} />
                      {room.deviceAccountEmail ? (
                        <button
                          type="button"
                          disabled={deviceBusyRoom !== null}
                          onClick={() => setConfirmResetRoom(room.roomId)}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-white/70 px-3.5 py-2 text-xs font-bold text-ink transition-colors hover:bg-white disabled:opacity-50"
                        >
                          <KeyRound size={13} strokeWidth={2.4} aria-hidden />
                          {deviceBusyRoom === room.roomId ? 'Resetting…' : 'Reset password'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={deviceBusyRoom !== null}
                          onClick={() => provisionDevice(room.roomId, 'create')}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-3.5 py-2 text-xs font-bold text-white shadow-md transition-colors hover:bg-brand-deep disabled:opacity-50"
                        >
                          <Plus size={13} strokeWidth={2.4} aria-hidden />
                          {deviceBusyRoom === room.roomId ? 'Creating…' : 'Create device account'}
                        </button>
                      )}
                    </span>
                  </div>

                  {deviceError?.roomId === room.roomId && (
                    <p role="alert" className="mt-2 text-sm font-semibold text-alarm">
                      {deviceError.message}
                    </p>
                  )}

                  {credential?.roomId === room.roomId && (
                    <dl className="mt-3 grid gap-3 rounded-xl border border-hairline bg-white/70 p-4 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
                      <dt className="font-semibold text-ink-2">Email</dt>
                      <dd className="min-w-0 break-all font-mono text-ink">
                        {credential.value.email}
                      </dd>
                      <dt className="font-semibold text-ink-2">Password</dt>
                      <dd className="min-w-0 break-all font-mono text-ink">
                        {credential.value.password}
                      </dd>
                      <dt className="font-semibold text-ink-2">Shown once</dt>
                      <dd className="text-ink-2">
                        Copy it now — it is never stored and cannot be retrieved later.
                      </dd>
                    </dl>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form
            onSubmit={handleRegister}
            className="mt-5 flex flex-col gap-4 border-t border-hairline pt-5"
          >
            <h3 className="text-sm font-bold text-ink">Register a room in this property</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Room ID"
                value={roomId}
                placeholder="room_002"
                onChange={(value) => {
                  setRoomId(value);
                  setFormStatus('idle');
                  setFormError(null);
                }}
              />
              <TextField
                label="Room name"
                value={roomName}
                placeholder="Garden Room"
                onChange={(value) => {
                  setRoomName(value);
                  setFormStatus('idle');
                  setFormError(null);
                }}
              />
              <TextField
                label="Property name (optional — renames this property)"
                value={propertyName}
                placeholder="Lagoon Villa"
                onChange={(value) => {
                  setPropertyName(value);
                  setFormStatus('idle');
                  setFormError(null);
                }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={formStatus === 'saving'}
                className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-brand-deep disabled:opacity-50"
              >
                <Plus size={16} strokeWidth={2.4} aria-hidden />
                {formStatus === 'saving' ? 'Registering…' : 'Register room'}
              </button>
              {formStatus === 'saved' && (
                <span className="text-sm font-semibold text-brand-deep">Room registered</span>
              )}
              {formStatus === 'error' && (
                <span role="alert" className="text-sm font-semibold text-alarm">
                  {formError ?? 'Could not register - try again.'}
                </span>
              )}
            </div>
          </form>
        </section>

        <section className="glass mt-6 rounded-2xl p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-2xl bg-brand-soft text-brand">
                <Users size={18} strokeWidth={2.2} />
              </span>
              <h2 className="text-sm font-bold text-ink">Owners</h2>
            </div>
            <Link
              href="/admin/owners"
              className="text-sm font-semibold text-brand transition-colors hover:text-brand-deep"
            >
              Manage owners →
            </Link>
          </div>

          {ownersState.status === 'loading' ? (
            <p className="text-sm text-ink-2">Loading…</p>
          ) : ownersState.status === 'error' ? (
            <div className="text-sm text-ink-2">
              <p role="alert">Couldn&apos;t load owners — check your connection and try again.</p>
              <button
                type="button"
                onClick={() => {
                  setOwnersState({ status: 'loading' });
                  setOwnersAttempt((n) => n + 1);
                }}
                className="mt-3 block rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-brand-deep"
              >
                Retry
              </button>
            </div>
          ) : (
            (() => {
              const assigned = ownersState.owners.filter((owner) =>
                owner.propertyIds.includes(propertyId),
              );
              const unassigned = ownersState.owners.filter(
                (owner) => !owner.propertyIds.includes(propertyId),
              );
              return (
                <>
                  {assigned.length === 0 ? (
                    <p className="text-sm text-ink-2">
                      No owners have access to this property yet — assign one below.
                    </p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-hairline">
                      {assigned.map((owner) => (
                        <ListRow
                          key={owner.uid}
                          title={owner.email}
                          subtitle={owner.uid}
                          right={
                            <span className="flex items-center gap-2">
                              {owner.disabled ? (
                                <Badge tone="danger">Disabled</Badge>
                              ) : (
                                <Badge tone="brand">Active</Badge>
                              )}
                              <button
                                type="button"
                                disabled={ownerBusy}
                                onClick={() => setConfirmRemoveOwner(owner)}
                                className="rounded-full border border-hairline bg-white/70 px-3 py-1.5 text-xs font-bold text-ink transition-colors hover:bg-white disabled:opacity-50"
                              >
                                Remove access
                              </button>
                            </span>
                          }
                        />
                      ))}
                    </ul>
                  )}

                  {ownerActionError && (
                    <p role="alert" className="mt-3 text-sm font-semibold text-alarm">
                      {ownerActionError}
                    </p>
                  )}

                  {unassigned.length > 0 && (
                    <div className="mt-5 flex flex-col gap-3 border-t border-hairline pt-5 sm:flex-row sm:items-end">
                      <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-semibold text-ink">
                        Assign an existing owner
                        <select
                          value={assignUid}
                          onChange={(e) => {
                            setAssignUid(e.target.value);
                            setOwnerActionError(null);
                          }}
                          className="box-border w-full min-w-0 rounded-xl border border-hairline bg-white/70 px-3.5 py-2.5 font-normal text-ink outline-none transition focus:ring-2 focus:ring-brand"
                        >
                          <option value="">Choose an owner…</option>
                          {unassigned.map((owner) => (
                            <option key={owner.uid} value={owner.uid}>
                              {owner.email}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={ownerBusy || assignUid === ''}
                        onClick={() =>
                          runOwnerAction(() =>
                            operations.assignOwnerToProperty(assignUid, propertyId),
                          )
                        }
                        className="inline-flex shrink-0 items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-brand-deep disabled:opacity-50"
                      >
                        <Plus size={16} strokeWidth={2.4} aria-hidden />
                        {ownerBusy ? 'Assigning…' : 'Assign'}
                      </button>
                    </div>
                  )}
                </>
              );
            })()
          )}
        </section>

        <div className="mt-6">
          <AlertCenter propertyId={propertyId} />
        </div>

        <AdminPropertySettings propertyId={propertyId} />

        <ConfirmDialog
          open={confirmRemoveOwner !== null}
          title="Remove this owner's access?"
          body={`${confirmRemoveOwner?.email ?? ''} will immediately lose access to ${propertyId} and its rooms.`}
          confirmLabel="Remove access"
          onCancel={() => setConfirmRemoveOwner(null)}
          onConfirm={() => {
            const target = confirmRemoveOwner;
            setConfirmRemoveOwner(null);
            if (target) runOwnerAction(() => operations.removeOwnerFromProperty(target.uid, propertyId));
          }}
        />

        <ConfirmDialog
          open={confirmResetRoom !== null}
          title="Reset device password?"
          body={`The current password for ${confirmResetRoom ?? ''} stops working immediately. The device must be re-provisioned with the new one.`}
          confirmLabel="Reset password"
          onCancel={() => setConfirmResetRoom(null)}
          onConfirm={() => {
            const target = confirmResetRoom;
            setConfirmResetRoom(null);
            if (target) provisionDevice(target, 'reset');
          }}
        />
      </div>
    </main>
  );
}
