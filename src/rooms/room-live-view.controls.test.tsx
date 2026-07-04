import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { RoomLatest } from './room-data-source';
import { FakeRoomDataSource } from './fake-room-data-source';
import { RoomDataSourceProvider } from './room-data-source-context';
import { RoomLiveView } from './room-live-view';

// Real timers throughout: "online" snapshots stamp updatedAt with Date.now(),
// the offline case stamps it 20 s in the past.
function liveSnapshot(overrides: RoomLatest = {}): RoomLatest {
  return {
    occupancyState: 'OCCUPIED_ACTIVE',
    temperature: 27.5,
    humidity: 62,
    gas: 150,
    relayStatus: true,
    updatedAt: Date.now(),
    ...overrides,
  };
}

function setup({
  snapshot = liveSnapshot(),
  commands = { lights: true } as Record<string, boolean>,
} = {}) {
  const source = new FakeRoomDataSource();
  source.emitLatest('property_001', 'room_001', snapshot);
  source.emitDeviceCommands('property_001', 'room_001', commands);
  render(
    <RoomDataSourceProvider source={source}>
      <RoomLiveView propertyId="property_001" roomId="room_001" roomName="Room 1" />
    </RoomDataSourceProvider>,
  );
  return source;
}

describe('RoomLiveView — device controls', () => {
  it('renders exactly the four approved switches — mainRelay cannot appear', () => {
    setup();
    expect(screen.getByRole('switch', { name: 'Lights' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Exhaust fan' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Water pump' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Presence relay' })).toBeInTheDocument();
    // 4 device commands + the vacancy-cutoff automation toggle
    expect(screen.getAllByRole('switch')).toHaveLength(5);
    expect(screen.queryByText(/main relay/i)).not.toBeInTheDocument();
  });

  it('reflects the commanded state from the subscription', () => {
    setup({ commands: { lights: true, waterPump: false } });
    expect(screen.getByRole('switch', { name: 'Lights' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Water pump' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Exhaust fan' })).not.toBeChecked(); // never written yet
  });

  it('toggling writes the one command and follows the echo', async () => {
    setup({ commands: { lights: true } });
    const user = userEvent.setup();

    await user.click(screen.getByRole('switch', { name: 'Lights' }));
    expect(screen.getByRole('switch', { name: 'Lights' })).not.toBeChecked();

    await user.click(screen.getByRole('switch', { name: 'Water pump' }));
    expect(screen.getByRole('switch', { name: 'Water pump' })).toBeChecked();
    // untouched keys stay as they were
    expect(screen.getByRole('switch', { name: 'Exhaust fan' })).not.toBeChecked();
  });

  it('shows the presence relay commanded and actual side by side', () => {
    setup({ commands: { motionDetection: false } });
    expect(screen.getByRole('switch', { name: 'Presence relay' })).not.toBeChecked();
    expect(screen.getByText(/actual: on/i)).toBeInTheDocument(); // relayStatus true in telemetry
  });

  it('disables every device command while the room is offline, with an explanation', () => {
    setup({ snapshot: liveSnapshot({ updatedAt: Date.now() - 20_000 }) });
    ['Lights', 'Exhaust fan', 'Water pump', 'Presence relay'].forEach((name) =>
      expect(screen.getByRole('switch', { name })).toBeDisabled(),
    );
    expect(screen.getByText(/controls disabled while offline/i)).toBeInTheDocument();
  });

  it('marks the exhaust fan as forced on during a gas alarm', () => {
    setup({ snapshot: liveSnapshot({ gas: 452 }) });
    expect(screen.getByText(/forced on by device/i)).toBeInTheDocument();
  });

  it('offers the vacancy-cutoff automation toggle, live and writable', async () => {
    setup();
    const user = userEvent.setup();
    const toggle = screen.getByRole('switch', { name: /vacancy cutoff automation/i });
    expect(toggle).not.toBeChecked(); // default off

    await user.click(toggle);
    expect(toggle).toBeChecked(); // fake echoes the setting write
  });

  it('keeps the automation toggle usable while the room is offline (it is a server setting, not a command)', () => {
    setup({ snapshot: liveSnapshot({ updatedAt: Date.now() - 20_000 }) });
    expect(
      screen.getByRole('switch', { name: /vacancy cutoff automation/i }),
    ).toBeEnabled();
    // device command switches stay disabled
    expect(screen.getByRole('switch', { name: 'Lights' })).toBeDisabled();
  });

  it('surfaces a failed command and keeps the subscribed truth', async () => {
    const source = setup({ commands: { lights: false } });
    source.failNextCommand();
    const user = userEvent.setup();

    await user.click(screen.getByRole('switch', { name: 'Lights' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/command failed/i);
    expect(screen.getByRole('switch', { name: 'Lights' })).not.toBeChecked();
  });
});
