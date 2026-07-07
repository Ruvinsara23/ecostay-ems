import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { colomboDateKey } from '@/server/colombo-time';
import { FakeRoomDataSource } from './fake-room-data-source';
import { RoomDataSourceProvider } from './room-data-source-context';
import { EnergyHistorySection } from './energy-charts';

const DAY_MS = 86_400_000;

function renderSection(source = new FakeRoomDataSource()) {
  render(
    <RoomDataSourceProvider source={source}>
      <EnergyHistorySection propertyId="property_001" roomId="room_001" />
    </RoomDataSourceProvider>,
  );
  return source;
}

function sampleAt(agoMs: number, power: number) {
  return { energy: 1, power, sampledAt: Date.now() - agoMs };
}

describe('EnergyHistorySection', () => {
  it('shows the estimated monthly bill from month-to-date kWh × the H-1 tariff', () => {
    const source = new FakeRoomDataSource();
    source.emitDailyAggregates('property_001', 'room_001', {
      [colomboDateKey(Date.now())]: { kWhUsed: 250, occupiedMinutes: 300 },
    });
    source.setTariffCategory('property_001', 'H-1');
    renderSection(source);
    // H-1 ≤300: 250×9 + 300 fixed = 2550, +SSCL 2.5⁄97.5 → 2615.38
    expect(screen.getByText(/estimated bill this month/i)).toBeInTheDocument();
    expect(screen.getByText(/2,615\.38/)).toBeInTheDocument();
  });

  it('shows OBJ-07 savings when the rollup recorded avoided energy', () => {
    const source = new FakeRoomDataSource();
    source.emitDailyAggregates('property_001', 'room_001', {
      [colomboDateKey(Date.now())]: { kWhUsed: 100, occupiedMinutes: 200, avoidedKWh: 12 },
    });
    source.setTariffCategory('property_001', 'H-1');
    renderSection(source);
    // 12 kWh avoided → H-1 marginal 9 LKR/kWh (+SSCL) ≈ LKR 110.77
    expect(screen.getByText(/saved this month/i)).toBeInTheDocument();
    expect(screen.getByText(/12(\.0+)? kWh/)).toBeInTheDocument();
    expect(screen.getByText(/110\.77/)).toBeInTheDocument();
  });

  it('prompts to set a tariff when none is configured', () => {
    const source = new FakeRoomDataSource();
    source.emitDailyAggregates('property_001', 'room_001', {
      [colomboDateKey(Date.now())]: { kWhUsed: 100, occupiedMinutes: 0 },
    });
    renderSection(source);
    expect(screen.getByText(/set a tariff/i)).toBeInTheDocument();
  });

  it('is honest before any history exists, and carries the Simulated badge', () => {
    renderSection();
    expect(screen.getByText(/no history yet/i)).toBeInTheDocument();
    expect(screen.getByText(/every 5 minutes/i)).toBeInTheDocument();
    expect(screen.getByText(/no daily totals yet/i)).toBeInTheDocument();
    expect(screen.getByText(/simulated/i)).toBeInTheDocument();
  });

  it('draws the 24 h power line from in-window samples only', () => {
    const source = new FakeRoomDataSource();
    source.emitEnergyHistory('property_001', 'room_001', [
      sampleAt(30 * 60_000, 4.2),
      sampleAt(20 * 60_000, 4.6),
      sampleAt(10 * 60_000, 4.4),
      { energy: 0.5, power: 9.9, sampledAt: Date.now() - 2 * DAY_MS }, // outside 24 h
    ]);
    renderSection(source);

    const line = document.querySelector('polyline');
    expect(line).not.toBeNull();
    expect(line!.getAttribute('points')!.trim().split(/\s+/)).toHaveLength(3);
    expect(screen.queryByText(/no history yet/i)).not.toBeInTheDocument();
  });

  it('extends the line live as new samples arrive', () => {
    const source = new FakeRoomDataSource();
    const initial = [sampleAt(10 * 60_000, 4.2)];
    source.emitEnergyHistory('property_001', 'room_001', initial);
    renderSection(source);

    act(() => {
      source.emitEnergyHistory('property_001', 'room_001', [
        ...initial,
        sampleAt(5 * 60_000, 4.8),
      ]);
    });

    expect(
      document.querySelector('polyline')!.getAttribute('points')!.trim().split(/\s+/),
    ).toHaveLength(2);
  });

  it('renders 7 day slots: bars for recorded days, gaps (not zeros) for missing ones', () => {
    const source = new FakeRoomDataSource();
    source.emitDailyAggregates('property_001', 'room_001', {
      [colomboDateKey(Date.now() - DAY_MS)]: { kWhUsed: 0.45, occupiedMinutes: 300 },
      [colomboDateKey(Date.now() - 2 * DAY_MS)]: { kWhUsed: 0.3, occupiedMinutes: 120 },
    });
    renderSection(source);

    expect(document.querySelectorAll('[data-bar]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-gap]')).toHaveLength(5);
    // selective labeling: the max day carries its value
    expect(screen.getByText('0.45')).toBeInTheDocument();
  });
});
