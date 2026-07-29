import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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
  it('renders exactly the five approved switches — mainRelay cannot appear', () => {
    setup();
    expect(screen.getByRole('switch', { name: 'Lights' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Exhaust fan' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Water pump' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Presence relay' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Air conditioner' })).toBeInTheDocument();
    // 5 device commands + the comfort-load automation toggle
    expect(screen.getAllByRole('switch')).toHaveLength(6);
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

  it('confirms a 3D object action before writing the real device command', async () => {
    setup({ commands: { lights: false } });
    const user = userEvent.setup();

    await user.click(
      screen.getByRole('button', { name: /turn on lights from 3d room/i }),
    );

    const dialog = screen.getByRole('dialog', { name: /turn on lights/i });
    expect(dialog).toHaveTextContent(/can switch a real relay/i);
    expect(screen.getByRole('switch', { name: 'Lights' })).not.toBeChecked();

    await user.click(within(dialog).getByRole('button', { name: /turn on lights/i }));
    expect(screen.getByRole('switch', { name: 'Lights' })).toBeChecked();
  });

  it('does not overwrite a newer command echo while confirmation is open', async () => {
    const source = setup({ commands: { lights: false } });
    const write = vi.spyOn(source, 'setDeviceCommand');
    const user = userEvent.setup();

    await user.click(
      screen.getByRole('button', { name: /turn on lights from 3d room/i }),
    );
    source.emitDeviceCommands('property_001', 'room_001', { lights: true });

    const dialog = screen.getByRole('dialog', { name: /turn on lights/i });
    await user.click(within(dialog).getByRole('button', { name: /turn on lights/i }));

    expect(write).not.toHaveBeenCalled();
    expect(screen.getByRole('switch', { name: 'Lights' })).toBeChecked();
  });

  it('invalidates an unconfirmed 3D action when the viewed room changes', async () => {
    class DelayedCommandsSource extends FakeRoomDataSource {
      delaySubscriptions = false;

      override subscribeDeviceCommands(
        propertyId: string,
        roomId: string,
        callback: (commands: Record<string, boolean>) => void,
      ) {
        if (this.delaySubscriptions) return () => {};
        return super.subscribeDeviceCommands(propertyId, roomId, callback);
      }
    }

    const source = new DelayedCommandsSource();
    source.emitLatest('property_001', 'room_001', liveSnapshot());
    source.emitLatest('property_001', 'room_002', liveSnapshot());
    source.emitDeviceCommands('property_001', 'room_001', { lights: false });
    source.emitDeviceCommands('property_001', 'room_002', { lights: true });
    const view = (roomId: string) => (
      <RoomDataSourceProvider source={source}>
        <RoomLiveView propertyId="property_001" roomId={roomId} roomName={roomId} />
      </RoomDataSourceProvider>
    );
    const { rerender } = render(view('room_001'));
    const user = userEvent.setup();

    await user.click(
      screen.getByRole('button', { name: /turn on lights from 3d room/i }),
    );
    expect(screen.getByRole('dialog', { name: /turn on lights/i })).toBeInTheDocument();

    source.delaySubscriptions = true;
    rerender(view('room_002'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(view('room_001'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /turn on lights from 3d room/i }),
    ).toBeDisabled();
  });

  it('shows the presence relay commanded and actual side by side', () => {
    setup({ commands: { motionDetection: false } });
    expect(screen.getByRole('switch', { name: 'Presence relay' })).not.toBeChecked();
    expect(screen.getByText(/actual: on/i)).toBeInTheDocument(); // relayStatus true in telemetry
  });

  it('disables every device command while the room is offline, with an explanation', () => {
    setup({ snapshot: liveSnapshot({ updatedAt: Date.now() - 20_000 }) });
    ['Lights', 'Exhaust fan', 'Water pump', 'Presence relay', 'Air conditioner'].forEach((name) =>
      expect(screen.getByRole('switch', { name })).toBeDisabled(),
    );
    expect(screen.getByText(/controls disabled while offline/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /turn off lights from 3d room/i }),
    ).toBeDisabled();
  });

  it('blocks comfort commands while sleeping but keeps pump and presence controls available', () => {
    setup({
      snapshot: liveSnapshot({ occupancyState: 'OCCUPIED_SLEEPING' }),
      commands: {
        lights: true,
        exhaustFan: true,
        airConditioner: true,
        waterPump: true,
        motionDetection: true,
      },
    });

    expect(screen.getByRole('switch', { name: 'Lights' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Exhaust fan' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Air conditioner' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Water pump' })).toBeEnabled();
    expect(screen.getByRole('switch', { name: 'Presence relay' })).toBeEnabled();
    expect(screen.getAllByText(/blocked while occupied sleeping/i)).toHaveLength(3);
  });

  it('marks the exhaust fan as forced on during a gas alarm', () => {
    setup({ snapshot: liveSnapshot({ gas: 452 }) });
    expect(screen.getByText(/forced on/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /exhaust fan forced on by gas alarm/i }),
    ).toBeDisabled();
  });

  it('offers the comfort-load automation toggle, live and writable', async () => {
    setup();
    const user = userEvent.setup();
    const toggle = screen.getByRole('switch', { name: /comfort load automation/i });
    expect(toggle).not.toBeChecked(); // default off

    await user.click(toggle);
    expect(toggle).toBeChecked(); // fake echoes the setting write
  });

  it('keeps the automation toggle usable while the room is offline (it is a server setting, not a command)', () => {
    setup({ snapshot: liveSnapshot({ updatedAt: Date.now() - 20_000 }) });
    expect(
      screen.getByRole('switch', { name: /comfort load automation/i }),
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
