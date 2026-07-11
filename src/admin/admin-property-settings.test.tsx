import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FakeRoomDataSource } from '@/rooms/fake-room-data-source';
import { RoomDataSourceProvider } from '@/rooms/room-data-source-context';
import { AdminPropertySettings } from './admin-property-settings';

function setup(source = new FakeRoomDataSource(), propertyId = 'property_001') {
  render(
    <RoomDataSourceProvider source={source}>
      <AdminPropertySettings propertyId={propertyId} />
    </RoomDataSourceProvider>,
  );
  return source;
}

function seeded() {
  const source = new FakeRoomDataSource();
  source.setTariffCategory('property_001', 'H-1');
  source.setCircuitWattages('property_001', { lights: 60, exhaustFan: 45 });
  source.setAlertThresholds('property_001', {
    temperatureC: 32,
    waterLevelPct: 25,
    acPowerThresholdW: 500,
  });
  return source;
}

describe('AdminPropertySettings (route-scoped, v2 slice 07)', () => {
  it('loads the routed property’s current settings', async () => {
    setup(seeded());

    await waitFor(() => expect(screen.getByLabelText(/tariff category/i)).toHaveValue('H-1'));
    expect(screen.getByLabelText(/lights/i)).toHaveValue(60);
    expect(screen.getByLabelText(/exhaust fan/i)).toHaveValue(45);
    expect(screen.getByLabelText(/temperature threshold/i)).toHaveValue(32);
    expect(screen.getByLabelText(/water threshold/i)).toHaveValue(25);
    expect(screen.getByLabelText(/ac on power threshold/i)).toHaveValue(500);
  });

  it('saves edited tariff, wattages, and thresholds through the same port paths', async () => {
    const source = setup(seeded());
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText(/tariff category/i)).toHaveValue('H-1'));

    const seenTariff: Array<string | null> = [];
    const seenWatts: Array<{ lights: number; exhaustFan: number } | null> = [];
    source.subscribeTariffCategory('property_001', (c) => seenTariff.push(c));
    source.subscribeCircuitWattages('property_001', (w) => seenWatts.push(w));

    await user.selectOptions(screen.getByLabelText(/tariff category/i), 'D-TOU');
    await user.clear(screen.getByLabelText(/lights/i));
    await user.type(screen.getByLabelText(/lights/i), '80');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(screen.getByText(/saved/i)).toBeInTheDocument());
    expect(seenTariff[seenTariff.length - 1]).toBe('D-TOU');
    expect(seenWatts[seenWatts.length - 1]).toEqual({ lights: 80, exhaustFan: 45 });
  });

  it('a property with zero rooms is fully configurable (route decides, not room discovery)', async () => {
    const source = setup(new FakeRoomDataSource(), 'property_009');
    const user = userEvent.setup();

    // Defaults render — nothing depends on rooms existing.
    expect(screen.getByLabelText(/temperature threshold/i)).toHaveValue(33);
    expect(screen.getByLabelText(/water threshold/i)).toHaveValue(20);

    const seenTariff: Array<string | null> = [];
    source.subscribeTariffCategory('property_009', (c) => seenTariff.push(c));
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(screen.getByText(/saved/i)).toBeInTheDocument());
    expect(seenTariff[seenTariff.length - 1]).toBe('D-1');
  });

  it('turns Firebase rules denial into an actionable save error', async () => {
    class DeniedSettingsSource extends FakeRoomDataSource {
      denyWrites = false;

      override async setTariffCategory(propertyId: string, category: string | null): Promise<void> {
        if (!this.denyWrites) return super.setTariffCategory(propertyId, category);
        throw new Error(
          'PERMISSION_DENIED: Permission denied at /properties/property_001/settings/tariffCategory',
        );
      }
    }

    const source = new DeniedSettingsSource();
    source.setTariffCategory('property_001', 'H-1');
    setup(source);
    source.denyWrites = true;
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText(/tariff category/i)).toHaveValue('H-1'));

    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Save denied by Firebase rules/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/database\.rules\.json/i);
  });
});
