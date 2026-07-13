import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeRoomDataSource } from './fake-room-data-source';
import { RoomDataSourceProvider } from './room-data-source-context';
import { RoomEvaluationView } from './room-evaluation-view';
import type { EvaluationRun } from './room-data-source';

function renderView(source: FakeRoomDataSource) {
  return render(
    <RoomDataSourceProvider source={source}>
      <RoomEvaluationView propertyId="property_001" roomId="room_001" roomName="Room 1" />
    </RoomDataSourceProvider>,
  );
}

describe('RoomEvaluationView (A/B runner)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables the runs until the device reports an energy reading', async () => {
    renderView(new FakeRoomDataSource()); // no latest → no meter reading
    expect(await screen.findByRole('button', { name: /start baseline run/i })).toBeDisabled();
    expect(screen.getByText(/waiting for the device to report/i)).toBeInTheDocument();
  });

  it('starts a baseline run (automation off) and shows it in progress', async () => {
    const user = userEvent.setup();
    const source = new FakeRoomDataSource();
    source.emitLatest('property_001', 'room_001', { occupancyState: 'VACANT', energy: 10, updatedAt: Date.now() });
    renderView(source);

    await user.click(await screen.findByRole('button', { name: /start baseline run/i }));

    expect(await screen.findByText(/baseline run in progress/i)).toBeInTheDocument();
    expect(screen.getByText(/automation off/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /stop run/i })).toBeInTheDocument();
  });

  it('shows the pre/post comparison and verdict once both runs are recorded', async () => {
    const source = new FakeRoomDataSource();
    source.setTariffCategory('property_001', 'H-1');
    source.emitLatest('property_001', 'room_001', { energy: 5, updatedAt: Date.now() });
    const HOUR = 3_600_000;
    // Equal 24 h windows — a valid §10.2 pair.
    const runs: EvaluationRun[] = [
      { id: 'r1', label: 'baseline', automationEnabled: false, startedAt: 0, endedAt: 24 * HOUR, startEnergyKWh: 100, endEnergyKWh: 103.1 },
      { id: 'r2', label: 'ecostay', automationEnabled: true, startedAt: 48 * HOUR, endedAt: 72 * HOUR, startEnergyKWh: 200, endEnergyKWh: 201.35 },
    ];
    source.emitEvaluationRuns('property_001', 'room_001', runs);
    renderView(source);

    expect(await screen.findByText('56.5%')).toBeInTheDocument();
    expect(screen.getByText(/target met/i)).toBeInTheDocument();
    // 3.1 / 1.35 kWh appear in both the comparison table and the runs list.
    expect(screen.getAllByText('3.1 kWh').length).toBeGreaterThan(0); // baseline
    expect(screen.getAllByText('1.35 kWh').length).toBeGreaterThan(0); // ecostay
    expect(screen.queryByText(/differ in length/i)).not.toBeInTheDocument();
  });

  it('warns instead of faking a saving when the two windows differ in length (audit #2)', async () => {
    const source = new FakeRoomDataSource();
    source.emitLatest('property_001', 'room_001', { energy: 5, updatedAt: Date.now() });
    const HOUR = 3_600_000;
    // Same RATE (1 kWh/h) but a 2 h baseline vs a 1 h EcoStay run: 0%, not 50%.
    source.emitEvaluationRuns('property_001', 'room_001', [
      { id: 'r1', label: 'baseline', automationEnabled: false, startedAt: 0, endedAt: 2 * HOUR, startEnergyKWh: 0, endEnergyKWh: 2 },
      { id: 'r2', label: 'ecostay', automationEnabled: true, startedAt: 10 * HOUR, endedAt: 11 * HOUR, startEnergyKWh: 0, endEnergyKWh: 1 },
    ]);
    renderView(source);

    expect(await screen.findByText('0%')).toBeInTheDocument();
    expect(screen.getByText(/below target/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/differ in length by more than 20%/i);
  });

  it('refuses to start a run against a stale reading from an offline device (audit #5)', async () => {
    const source = new FakeRoomDataSource();
    // Energy is present but the device went silent 60 s ago.
    source.emitLatest('property_001', 'room_001', { energy: 12, updatedAt: Date.now() - 60_000 });
    renderView(source);

    expect(await screen.findByRole('button', { name: /start baseline run/i })).toBeDisabled();
    expect(screen.getByText(/device is offline/i)).toBeInTheDocument();
  });

  it('deletes a recorded run', async () => {
    const user = userEvent.setup();
    const source = new FakeRoomDataSource();
    source.emitLatest('property_001', 'room_001', { energy: 5, updatedAt: Date.now() });
    source.emitEvaluationRuns('property_001', 'room_001', [
      { id: 'r1', label: 'baseline', automationEnabled: false, startedAt: 1_000, endedAt: 2_000, startEnergyKWh: 1, endEnergyKWh: 2 },
    ]);
    renderView(source);

    await user.click(await screen.findByRole('button', { name: /delete/i }));
    expect(screen.queryByText(/recorded runs/i)).not.toBeInTheDocument();
  });
});
