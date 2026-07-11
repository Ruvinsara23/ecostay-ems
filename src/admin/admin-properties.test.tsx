import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAdminOperations } from './admin-operations.fake';
import { AdminOperationsProvider } from './admin-operations-context';
import { AdminProperties } from './admin-properties';

const routerMock = { replace: vi.fn(), push: vi.fn() };

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  usePathname: () => '/admin',
}));

function renderView(operations: FakeAdminOperations) {
  return render(
    <AdminOperationsProvider operations={operations}>
      <AdminProperties />
    </AdminOperationsProvider>,
  );
}

describe('AdminProperties', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists every property with its name and counts', async () => {
    const ops = new FakeAdminOperations();
    ops.properties = [
      { propertyId: 'property_001', name: 'EcoStay Villa', roomCount: 2, ownerCount: 1 },
      { propertyId: 'property_002', name: null, roomCount: 1, ownerCount: 0 },
    ];
    renderView(ops);

    expect(await screen.findByText('EcoStay Villa')).toBeInTheDocument();
    expect(screen.getByText(/2 rooms · 1 owner/)).toBeInTheDocument();
    // Nameless property falls back to its id.
    expect(screen.getByText(/1 room · 0 owners/)).toBeInTheDocument();
  });

  it('opens the property detail when a row is clicked', async () => {
    const user = userEvent.setup();
    const ops = new FakeAdminOperations();
    ops.properties = [
      { propertyId: 'property_001', name: 'EcoStay Villa', roomCount: 2, ownerCount: 1 },
    ];
    renderView(ops);

    await user.click(await screen.findByRole('button', { name: /ecostay villa/i }));
    expect(routerMock.push).toHaveBeenCalledWith('/admin/properties/property_001');
  });

  it('shows an error with retry instead of silently rendering an empty list', async () => {
    const user = userEvent.setup();
    const ops = new FakeAdminOperations();
    ops.properties = [
      { propertyId: 'property_001', name: 'EcoStay Villa', roomCount: 2, ownerCount: 1 },
    ];
    ops.failWith = 'network down';
    renderView(ops);

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t load properties/i);

    ops.failWith = null;
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('EcoStay Villa')).toBeInTheDocument();
  });

  it('explains how properties come to exist when there are none', async () => {
    renderView(new FakeAdminOperations());
    expect(await screen.findByText(/no properties yet/i)).toBeInTheDocument();
    expect(screen.getByText(/register the first one below/i)).toBeInTheDocument();
  });
});
