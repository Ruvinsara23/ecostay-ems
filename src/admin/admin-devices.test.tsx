import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAdminOperations } from './admin-operations.fake';
import { AdminOperationsProvider } from './admin-operations-context';
import { AdminDevices } from './admin-devices';

const routerMock = { replace: vi.fn(), push: vi.fn() };

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  usePathname: () => '/admin/devices',
}));

function renderView(operations: FakeAdminOperations) {
  return render(
    <AdminOperationsProvider operations={operations}>
      <AdminDevices />
    </AdminOperationsProvider>,
  );
}

function seed(ops: FakeAdminOperations) {
  ops.properties = [
    { propertyId: 'property_001', name: 'EcoStay Villa', roomCount: 2, ownerCount: 1 },
  ];
  ops.roomsByProperty = {
    property_001: [
      {
        roomId: 'room_001',
        roomName: 'Garden Room',
        deviceAccountEmail: 'device+property_001+room_001@devices.ecostay.local',
        lastSeenAt: Date.UTC(2026, 6, 11, 3, 30),
      },
      { roomId: 'room_002', roomName: null, deviceAccountEmail: null, lastSeenAt: null },
    ],
  };
}

describe('AdminDevices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists every room with device-account presence and last-seen honesty', async () => {
    const ops = new FakeAdminOperations();
    seed(ops);
    renderView(ops);

    expect(await screen.findByText('Garden Room')).toBeInTheDocument();
    expect(screen.getByText('Account')).toBeInTheDocument();
    // Roomless-name row falls back to its id; no account and never reported are stated, not hidden.
    expect(screen.getByText('room_002')).toBeInTheDocument();
    expect(screen.getByText('No account')).toBeInTheDocument();
    expect(screen.getByText(/never reported/i)).toBeInTheDocument();
  });

  it('opens the property detail (where credentials live) when a row is clicked', async () => {
    const user = userEvent.setup();
    const ops = new FakeAdminOperations();
    seed(ops);
    renderView(ops);

    await user.click(await screen.findByRole('button', { name: /garden room/i }));
    expect(routerMock.push).toHaveBeenCalledWith('/admin/properties/property_001');
  });

  it('shows an error with retry instead of a silently empty registry', async () => {
    const user = userEvent.setup();
    const ops = new FakeAdminOperations();
    seed(ops);
    ops.failWith = 'network down';
    renderView(ops);

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t load devices/i);

    ops.failWith = null;
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('Garden Room')).toBeInTheDocument();
  });

  it('points at the Properties page when no rooms are registered yet', async () => {
    renderView(new FakeAdminOperations());

    expect(await screen.findByText(/no rooms registered yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /register a property/i })).toHaveAttribute(
      'href',
      '/admin/properties',
    );
  });
});
