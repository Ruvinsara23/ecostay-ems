import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomDataSource, RoomLatest } from './room-data-source';
import { FakeRoomDataSource } from './fake-room-data-source';
import { RoomDataSourceProvider } from './room-data-source-context';
import { RoomLiveView } from './room-live-view';

function renderView(source: RoomDataSource) {
  return render(
    <RoomDataSourceProvider source={source}>
      <RoomLiveView propertyId="property_001" roomId="room_001" roomName="Room 1" />
    </RoomDataSourceProvider>,
  );
}

describe('RoomLiveView — states', () => {
  it('shows a loading state until the first report arrives', () => {
    const silentSource: RoomDataSource = {
      listAccessibleRooms: async () => [],
      subscribeLatest: () => () => {},
      subscribeServerTimeOffset: () => () => {},
    };
    renderView(silentSource);
    expect(screen.getByText(/loading room/i)).toBeInTheDocument();
  });

  it('says so when the room has never reported (distinct from loading)', () => {
    renderView(new FakeRoomDataSource());
    expect(screen.getByText(/never reported/i)).toBeInTheDocument();
    expect(screen.queryByText(/loading room/i)).not.toBeInTheDocument();
  });

  it('renders live telemetry with a plain-language occupancy summary', () => {
    const source = new FakeRoomDataSource();
    source.emitLatest('property_001', 'room_001', {
      occupancyState: 'OCCUPIED_ACTIVE',
      temperature: 27.5,
      humidity: 62,
      updatedAt: 1_751_600_000_000,
    });
    renderView(source);

    expect(screen.getByText('Occupied')).toBeInTheDocument();
    expect(screen.getByText('OCCUPIED_ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('27.5 °C')).toBeInTheDocument();
  });

  it('summarizes VACANT_CONFIRMED as Vacant', () => {
    const source = new FakeRoomDataSource();
    source.emitLatest('property_001', 'room_001', {
      occupancyState: 'VACANT_CONFIRMED',
      updatedAt: 1_751_600_000_000,
    });
    renderView(source);
    expect(screen.getByText('Vacant')).toBeInTheDocument();
  });
});

const FULL_SNAPSHOT: RoomLatest = {
  voltage: 229.8,
  current: 0.02,
  power: 4.7,
  energy: 1.234,
  gas: 150,
  pir: true,
  doorOpen: true,
  temperature: 27.5,
  humidity: 62,
  lightLevel: 0,
  waterLevel: 76,
  flowRate: 2.5,
  totalLiters: 12.4,
  relayStatus: true,
  buzzerStatus: false,
  occupancyState: 'OCCUPIED_ACTIVE',
  humanPresent: true,
  motionDetected: true,
  updatedAt: 1_751_600_000_000,
};

describe('RoomLiveView — full telemetry', () => {
  function renderFull(overrides: RoomLatest = {}) {
    const source = new FakeRoomDataSource();
    source.emitLatest('property_001', 'room_001', { ...FULL_SNAPSHOT, ...overrides });
    renderView(source);
    return source;
  }

  it('renders every contract field with its unit', () => {
    renderFull();
    // climate
    expect(screen.getByText('27.5 °C')).toBeInTheDocument();
    expect(screen.getByText('62 %')).toBeInTheDocument();
    // power (simulated)
    expect(screen.getByText('4.7 W')).toBeInTheDocument();
    expect(screen.getByText('1.234 kWh')).toBeInTheDocument();
    expect(screen.getByText('229.8 V')).toBeInTheDocument();
    expect(screen.getByText('0.02 A')).toBeInTheDocument();
    // safety
    expect(screen.getByText('150 ppm')).toBeInTheDocument();
    // water
    expect(screen.getByText('76 %')).toBeInTheDocument();
    expect(screen.getByText('2.5 L/min')).toBeInTheDocument();
    expect(screen.getByText('12.4 L')).toBeInTheDocument();
    // activity & relays
    expect(screen.getByText('Open')).toBeInTheDocument(); // door
    expect(screen.getByText('Detected')).toBeInTheDocument(); // motion
    expect(screen.getByText('Present')).toBeInTheDocument(); // human presence
    expect(screen.getByText('On')).toBeInTheDocument(); // presence relay
    expect(screen.getByText('Off')).toBeInTheDocument(); // buzzer
  });

  it('labels the PZEM readings as simulated (ADR-0003)', () => {
    renderFull();
    expect(screen.getAllByText(/simulated/i).length).toBeGreaterThanOrEqual(1);
  });

  it('is honest about the missing light sensor', () => {
    renderFull();
    expect(screen.getByText(/no sensor/i)).toBeInTheDocument();
  });

  it('flags a gas alarm above the threshold', () => {
    renderFull({ gas: 450 });
    expect(screen.getByText(/gas alarm/i)).toBeInTheDocument();
  });

  it('shows no gas alarm at safe levels', () => {
    renderFull({ gas: 150 });
    expect(screen.queryByText(/gas alarm/i)).not.toBeInTheDocument();
  });
});

describe('RoomLiveView — updates & resilience', () => {
  it('re-renders on its own when a new snapshot arrives', () => {
    const source = new FakeRoomDataSource();
    source.emitLatest('property_001', 'room_001', FULL_SNAPSHOT);
    renderView(source);
    expect(screen.getByText('27.5 °C')).toBeInTheDocument();

    act(() =>
      source.emitLatest('property_001', 'room_001', {
        ...FULL_SNAPSHOT,
        temperature: 28.1,
        occupancyState: 'OCCUPIED_IDLE',
      }),
    );

    expect(screen.getByText('28.1 °C')).toBeInTheDocument();
    expect(screen.getByText('OCCUPIED_IDLE')).toBeInTheDocument();
    expect(screen.queryByText('27.5 °C')).not.toBeInTheDocument();
  });

  it('renders a placeholder for a missing field without blanking the rest', () => {
    const withoutTemperature: RoomLatest = { ...FULL_SNAPSHOT };
    delete withoutTemperature.temperature;
    const source = new FakeRoomDataSource();
    source.emitLatest('property_001', 'room_001', withoutTemperature);
    renderView(source);
    expect(screen.getByText('—')).toBeInTheDocument(); // temperature placeholder
    expect(screen.getByText('62 %')).toBeInTheDocument(); // humidity unaffected
  });

  it('shows — for an occupancy state outside the contract instead of guessing', () => {
    const source = new FakeRoomDataSource();
    source.emitLatest('property_001', 'room_001', {
      ...FULL_SNAPSHOT,
      occupancyState: 'GARBAGE_STATE' as never,
    });
    renderView(source);
    expect(screen.getByText('—')).toBeInTheDocument(); // summary refuses to guess
    expect(screen.queryByText('Occupied')).not.toBeInTheDocument();
    expect(screen.queryByText('Vacant')).not.toBeInTheDocument();
    expect(screen.getByText('62 %')).toBeInTheDocument(); // rest of the view intact
  });
});

describe('RoomLiveView — freshness & offline honesty', () => {
  const T0 = 1_751_600_000_000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function renderFreshness({
    offsetMs = 0,
    updatedAt = T0,
  }: { offsetMs?: number; updatedAt?: number | null } = {}) {
    const source = new FakeRoomDataSource();
    source.setServerTimeOffset(offsetMs);
    const snapshot: RoomLatest = { ...FULL_SNAPSHOT, updatedAt: updatedAt ?? undefined };
    if (updatedAt === null) delete snapshot.updatedAt;
    source.emitLatest('property_001', 'room_001', snapshot);
    renderView(source);
    return source;
  }

  it('shows Live while snapshots are fresh', () => {
    renderFreshness();
    expect(screen.getByText(/live · /i)).toBeInTheDocument();
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();
    expect(document.querySelector('[data-stale="true"]')).toBeNull();
  });

  it('flips to Offline past 15 s of silence, greys the readings, shows last seen', () => {
    renderFreshness();
    act(() => {
      vi.advanceTimersByTime(16_000);
    });
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
    expect(screen.getByText(/last seen 16s ago/i)).toBeInTheDocument();
    expect(document.querySelector('[data-stale="true"]')).not.toBeNull();
    // readings remain visible (greyed, not blanked)
    expect(screen.getByText('27.5 °C')).toBeInTheDocument();
  });

  it('keeps the last-seen age ticking while offline', () => {
    renderFreshness();
    act(() => {
      vi.advanceTimersByTime(26_000);
    });
    expect(screen.getByText(/last seen 26s ago/i)).toBeInTheDocument();
  });

  it('formats minute-scale silences', () => {
    renderFreshness();
    act(() => {
      vi.advanceTimersByTime(190_000);
    });
    expect(screen.getByText(/last seen 3m ago/i)).toBeInTheDocument();
  });

  it('recovers to Live automatically when writes resume', () => {
    const source = renderFreshness();
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(screen.getByText(/offline/i)).toBeInTheDocument();

    act(() => {
      source.emitLatest('property_001', 'room_001', {
        ...FULL_SNAPSHOT,
        updatedAt: T0 + 20_000,
      });
    });

    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();
    expect(document.querySelector('[data-stale="true"]')).toBeNull();
  });

  it('judges freshness on the server clock, not the skewed local clock', () => {
    // The measured field case: local clock 1528 s behind server time. The device
    // last wrote 128 s ago in server terms — naively that timestamp is "in the
    // future" locally and would look permanently live. It must read offline.
    renderFreshness({
      offsetMs: 1_528_000,
      updatedAt: T0 + 1_528_000 - 128_000,
    });
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
    expect(screen.getByText(/last seen 2m ago/i)).toBeInTheDocument();
  });

  it('treats a snapshot without updatedAt as offline with unknown last-seen', () => {
    renderFreshness({ updatedAt: null });
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
    expect(screen.getByText(/last seen unknown/i)).toBeInTheDocument();
  });
});
