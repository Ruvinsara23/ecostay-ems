import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAdminOperations } from './admin-operations.fake';
import { AdminOperationsProvider } from './admin-operations-context';
import { AdminOverview } from './admin-overview';

const routerMock = { replace: vi.fn(), push: vi.fn() };

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  usePathname: () => '/admin',
}));

function renderView(operations: FakeAdminOperations) {
  return render(
    <AdminOperationsProvider operations={operations}>
      <AdminOverview />
    </AdminOperationsProvider>,
  );
}

describe('AdminOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows fleet totals, per-property reporting badges, and open-alert chips', async () => {
    const ops = new FakeAdminOperations();
    ops.statuses = [
      {
        propertyId: 'property_001',
        name: 'EcoStay Villa',
        roomCount: 2,
        roomsReporting: 1,
        openAlerts: [
          { roomId: 'room_002', type: 'device-offline' },
          { roomId: 'room_002', type: 'gas' },
        ],
      },
      { propertyId: 'property_002', name: null, roomCount: 1, roomsReporting: 1, openAlerts: [] },
    ];
    renderView(ops);

    expect(await screen.findByText('EcoStay Villa')).toBeInTheDocument();
    // Totals: 2 properties, 2 of 3 rooms reporting.
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(screen.getByText('Rooms reporting')).toBeInTheDocument();
    expect(screen.getByText('Open alerts')).toBeInTheDocument();
    // Per-property health badges.
    expect(screen.getByText('1/2 reporting')).toBeInTheDocument();
    expect(screen.getByText('All reporting')).toBeInTheDocument();
    // Open alerts name the room and the human-readable type.
    expect(screen.getByText(/room_002 · Device offline/)).toBeInTheDocument();
    expect(screen.getByText(/room_002 · Gas/)).toBeInTheDocument();
  });

  it('opens the property detail when a row is clicked', async () => {
    const user = userEvent.setup();
    const ops = new FakeAdminOperations();
    ops.statuses = [
      { propertyId: 'property_001', name: 'EcoStay Villa', roomCount: 1, roomsReporting: 1, openAlerts: [] },
    ];
    renderView(ops);

    await user.click(await screen.findByRole('button', { name: /ecostay villa/i }));
    expect(routerMock.push).toHaveBeenCalledWith('/admin/properties/property_001');
  });

  it('shows an error with retry instead of a silently healthy-looking fleet', async () => {
    const user = userEvent.setup();
    const ops = new FakeAdminOperations();
    ops.statuses = [
      { propertyId: 'property_001', name: 'EcoStay Villa', roomCount: 1, roomsReporting: 1, openAlerts: [] },
    ];
    ops.failWith = 'network down';
    renderView(ops);

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t load fleet status/i);

    ops.failWith = null;
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('EcoStay Villa')).toBeInTheDocument();
  });

  it('points at the Properties page when nothing is registered yet', async () => {
    renderView(new FakeAdminOperations());

    expect(await screen.findByText(/no properties yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /register the first one/i })).toHaveAttribute(
      'href',
      '/admin/properties',
    );
  });
});
