import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AuthProvider } from '@/auth/auth-context';
import { FakeAuthGateway } from '@/auth/fake-auth-gateway';
import { FakeRoomDataSource } from '@/rooms/fake-room-data-source';
import { RoomDataSourceProvider } from '@/rooms/room-data-source-context';
import { AdminSettings } from './admin-settings';

function setup() {
  const source = new FakeRoomDataSource();
  source.setAccessibleRooms([
    { propertyId: 'property_001', roomId: 'room_001', propertyName: 'EcoStay Property', roomName: 'Room 1' },
  ]);
  source.setTariffCategory('property_001', 'H-1');
  source.setCircuitWattages('property_001', { lights: 60, exhaustFan: 45 });
  render(
    <AuthProvider gateway={new FakeAuthGateway({ initialSession: { uid: 'uid-admin', email: 'admin@ecostay.test', role: 'admin' } })}>
      <RoomDataSourceProvider source={source}>
        <AdminSettings />
      </RoomDataSourceProvider>
    </AuthProvider>,
  );
  return source;
}

describe('AdminSettings', () => {
  it('shows the property and its current tariff + wattages', async () => {
    setup();
    expect(await screen.findByText(/EcoStay Property/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText(/tariff category/i)).toHaveValue('H-1'),
    );
    expect(screen.getByLabelText(/lights/i)).toHaveValue(60);
    expect(screen.getByLabelText(/exhaust fan/i)).toHaveValue(45);
  });

  it('saves edited tariff + wattages through the port', async () => {
    const source = setup();
    const user = userEvent.setup();
    await screen.findByLabelText(/tariff category/i);

    const seenTariff: Array<string | null> = [];
    const seenWatts: Array<{ lights: number; exhaustFan: number } | null> = [];
    source.subscribeTariffCategory('property_001', (c) => seenTariff.push(c));
    source.subscribeCircuitWattages('property_001', (w) => seenWatts.push(w));

    await user.selectOptions(screen.getByLabelText(/tariff category/i), 'GP-1');
    await user.clear(screen.getByLabelText(/lights/i));
    await user.type(screen.getByLabelText(/lights/i), '80');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(screen.getByText(/saved/i)).toBeInTheDocument());
    expect(seenTariff[seenTariff.length - 1]).toBe('GP-1');
    expect(seenWatts[seenWatts.length - 1]).toEqual({ lights: 80, exhaustFan: 45 });
  });

  it('shows an empty state when the admin has no properties', async () => {
    const source = new FakeRoomDataSource();
    render(
      <AuthProvider gateway={new FakeAuthGateway({ initialSession: { uid: 'uid-admin', email: 'admin@ecostay.test', role: 'admin' } })}>
        <RoomDataSourceProvider source={source}>
          <AdminSettings />
        </RoomDataSourceProvider>
      </AuthProvider>,
    );
    expect(await screen.findByText(/no properties/i)).toBeInTheDocument();
  });
});
