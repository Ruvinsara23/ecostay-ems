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
    const runs: EvaluationRun[] = [
      { id: 'r1', label: 'baseline', automationEnabled: false, startedAt: 1_000, endedAt: 2_000, startEnergyKWh: 100, endEnergyKWh: 103.1 },
      { id: 'r2', label: 'ecostay', automationEnabled: true, startedAt: 3_000, endedAt: 4_000, startEnergyKWh: 200, endEnergyKWh: 201.35 },
    ];
    source.emitEvaluationRuns('property_001', 'room_001', runs);
    renderView(source);

    expect(await screen.findByText('56.5%')).toBeInTheDocument();
    expect(screen.getByText(/target met/i)).toBeInTheDocument();
    // 3.1 / 1.35 kWh appear in both the comparison table and the runs list.
    expect(screen.getAllByText('3.1 kWh').length).toBeGreaterThan(0); // baseline
    expect(screen.getAllByText('1.35 kWh').length).toBeGreaterThan(0); // ecostay
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
