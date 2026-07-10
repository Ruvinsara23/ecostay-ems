import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AuthProvider } from '@/auth/auth-context';
import { FakeAuthGateway } from '@/auth/fake-auth-gateway';
import { FakeRoomDataSource } from '@/rooms/fake-room-data-source';
import { RoomDataSourceProvider } from '@/rooms/room-data-source-context';
import { AdminSettings } from './admin-settings';

function setup(source = new FakeRoomDataSource()) {
  source.setAccessibleRooms([
    { propertyId: 'property_001', roomId: 'room_001', propertyName: 'EcoStay Property', roomName: 'Room 1' },
  ]);
  source.setTariffCategory('property_001', 'H-1');
  source.setCircuitWattages('property_001', { lights: 60, exhaustFan: 45 });
  source.setAlertThresholds('property_001', { temperatureC: 32, waterLevelPct: 25, acPowerThresholdW: 500 });
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
  it('shows the property and its current settings', async () => {
    setup();
    expect(await screen.findByText(/EcoStay Property/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText(/tariff category/i)).toHaveValue('H-1'),
    );
    expect(screen.getByLabelText(/lights/i)).toHaveValue(60);
    expect(screen.getByLabelText(/exhaust fan/i)).toHaveValue(45);
    expect(screen.getByLabelText(/temperature threshold/i)).toHaveValue(32);
    expect(screen.getByLabelText(/water threshold/i)).toHaveValue(25);
  });

  it('saves edited tariff, wattages, and alert thresholds through the port', async () => {
    const source = setup();
    const user = userEvent.setup();
    await screen.findByLabelText(/tariff category/i);

    const seenTariff: Array<string | null> = [];
    const seenWatts: Array<{ lights: number; exhaustFan: number } | null> = [];
    const seenThresholds: Array<{ temperatureC: number; waterLevelPct: number; acPowerThresholdW: number } | null> = [];
    source.subscribeTariffCategory('property_001', (c) => seenTariff.push(c));
    source.subscribeCircuitWattages('property_001', (w) => seenWatts.push(w));
    source.subscribeAlertThresholds('property_001', (thresholds) =>
      seenThresholds.push(thresholds),
    );

    await user.selectOptions(screen.getByLabelText(/tariff category/i), 'GP-1');
    await user.clear(screen.getByLabelText(/lights/i));
    await user.type(screen.getByLabelText(/lights/i), '80');
    await user.clear(screen.getByLabelText(/temperature threshold/i));
    await user.type(screen.getByLabelText(/temperature threshold/i), '35');
    await user.clear(screen.getByLabelText(/water threshold/i));
    await user.type(screen.getByLabelText(/water threshold/i), '18');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(screen.getByText(/saved/i)).toBeInTheDocument());
    expect(seenTariff[seenTariff.length - 1]).toBe('GP-1');
    expect(seenWatts[seenWatts.length - 1]).toEqual({ lights: 80, exhaustFan: 45 });
    expect(seenThresholds[seenThresholds.length - 1]).toEqual({
      temperatureC: 35,
      waterLevelPct: 18,
      acPowerThresholdW: 500,
    });
  });

  it('uses default alert thresholds when no setting exists yet', async () => {
    const source = new FakeRoomDataSource();
    source.setAccessibleRooms([
      {
        propertyId: 'property_001',
        roomId: 'room_001',
        propertyName: 'EcoStay Property',
        roomName: 'Room 1',
      },
    ]);
    render(
      <AuthProvider gateway={new FakeAuthGateway({ initialSession: { uid: 'uid-admin', email: 'admin@ecostay.test', role: 'admin' } })}>
        <RoomDataSourceProvider source={source}>
          <AdminSettings />
        </RoomDataSourceProvider>
      </AuthProvider>,
    );

    await screen.findByLabelText(/temperature threshold/i);
    expect(screen.getByLabelText(/temperature threshold/i)).toHaveValue(33);
    expect(screen.getByLabelText(/water threshold/i)).toHaveValue(20);
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

  it('turns Firebase rules denial into an actionable save error', async () => {
    class DeniedSettingsSource extends FakeRoomDataSource {
      denyWrites = false;

      override async setTariffCategory(): Promise<void> {
        if (!this.denyWrites) return;
        throw new Error(
          'PERMISSION_DENIED: Permission denied at /properties/property_001/settings/tariffCategory',
        );
      }
    }

    const source = new DeniedSettingsSource();
    setup(source);
    source.denyWrites = true;
    const user = userEvent.setup();
    await screen.findByLabelText(/tariff category/i);

    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Save denied by Firebase rules/i,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/database\.rules\.json/i);
  });
});
