import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FakeAdminOperations } from './admin-operations.fake';
import { AdminOperationsProvider } from './admin-operations-context';
import { AdminRooms } from './admin-rooms';

function renderForm(operations: FakeAdminOperations) {
  return render(
    <AdminOperationsProvider operations={operations}>
      <AdminRooms />
    </AdminOperationsProvider>,
  );
}

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('AdminRooms', () => {
  it('registers a room via the operations port and reports success', async () => {
    const ops = new FakeAdminOperations();
    renderForm(ops);

    fill(/property id/i, 'property_002');
    fill(/room id/i, 'room_009');
    fill(/room name/i, 'Garden Room');
    fill(/property name/i, 'Lagoon Villa');
    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() =>
      expect(ops.registrations).toEqual([
        {
          propertyId: 'property_002',
          roomId: 'room_009',
          roomName: 'Garden Room',
          propertyName: 'Lagoon Villa',
        },
      ]),
    );
    expect(await screen.findByText(/registered/i)).toBeInTheDocument();
  });

  it('omits a blank property name', async () => {
    const ops = new FakeAdminOperations();
    renderForm(ops);

    fill(/property id/i, 'property_002');
    fill(/room id/i, 'room_009');
    fill(/room name/i, 'Garden Room');
    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() =>
      expect(ops.registrations).toEqual([
        { propertyId: 'property_002', roomId: 'room_009', roomName: 'Garden Room' },
      ]),
    );
  });

  it('surfaces the server error message and keeps the input', async () => {
    const ops = new FakeAdminOperations();
    ops.failWith = 'roomId must be a slug';
    renderForm(ops);

    fill(/property id/i, 'property_002');
    fill(/room id/i, 'BAD ID');
    fill(/room name/i, 'Garden Room');
    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('roomId must be a slug');
    expect(screen.getByLabelText(/room id/i)).toHaveValue('BAD ID');
  });

  it('creates a device account and shows the returned credential once', async () => {
    const ops = new FakeAdminOperations();
    renderForm(ops);

    fill(/device property/i, 'property_002');
    fill(/device room/i, 'room_009');
    fireEvent.click(screen.getByRole('button', { name: /create device account/i }));

    await waitFor(() =>
      expect(ops.deviceCreates).toEqual([{ propertyId: 'property_002', roomId: 'room_009' }]),
    );
    expect(await screen.findByText('device+property_002+room_009@devices.ecostay.local')).toBeInTheDocument();
    expect(screen.getByText('fake-device-password')).toBeInTheDocument();
  });

  it('resets a device password through the operations port', async () => {
    const ops = new FakeAdminOperations();
    ops.nextDevicePassword = 'reset-device-password';
    renderForm(ops);

    fill(/device property/i, 'property_002');
    fill(/device room/i, 'room_009');
    fireEvent.click(screen.getByRole('button', { name: /reset device password/i }));

    await waitFor(() =>
      expect(ops.deviceResets).toEqual([{ propertyId: 'property_002', roomId: 'room_009' }]),
    );
    expect(await screen.findByText('reset-device-password')).toBeInTheDocument();
  });

  it('surfaces a device account error without showing a credential', async () => {
    const ops = new FakeAdminOperations();
    ops.failWith = 'room must be registered before creating a device account';
    renderForm(ops);

    fill(/device property/i, 'property_002');
    fill(/device room/i, 'room_009');
    fireEvent.click(screen.getByRole('button', { name: /create device account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/room must be registered/i);
    expect(screen.queryByText(/fake-device-password/i)).not.toBeInTheDocument();
  });
});
