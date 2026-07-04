import type { Session } from '@/auth/auth-gateway';
import type { DeviceCommandKey, DeviceCommands } from '@/telemetry/contract';
import type { RoomDataSource, RoomLatest, RoomRef } from './room-data-source';

type Listener = (latest: RoomLatest | null) => void;
type CommandListener = (commands: DeviceCommands) => void;

/** In-memory RoomDataSource for tests; the seeder for UI behavior. */
export class FakeRoomDataSource implements RoomDataSource {
  private snapshots = new Map<string, RoomLatest>();
  private listeners = new Map<string, Set<Listener>>();
  private accessibleRooms: RoomRef[] = [];
  private serverTimeOffsetMs = 0;
  private offsetListeners = new Set<(offsetMs: number) => void>();

  setAccessibleRooms(rooms: RoomRef[]): void {
    this.accessibleRooms = rooms;
  }

  setServerTimeOffset(offsetMs: number): void {
    this.serverTimeOffsetMs = offsetMs;
    this.offsetListeners.forEach((listener) => listener(offsetMs));
  }

  subscribeServerTimeOffset(callback: (offsetMs: number) => void): () => void {
    this.offsetListeners.add(callback);
    callback(this.serverTimeOffsetMs);
    return () => {
      this.offsetListeners.delete(callback);
    };
  }

  private commands = new Map<string, DeviceCommands>();
  private commandListeners = new Map<string, Set<CommandListener>>();
  private commandFailure: Error | null = null;

  emitDeviceCommands(propertyId: string, roomId: string, commands: DeviceCommands): void {
    const key = `${propertyId}/${roomId}`;
    this.commands.set(key, commands);
    this.commandListeners.get(key)?.forEach((listener) => listener(commands));
  }

  /** The next setDeviceCommand rejects (rules denial / network), state untouched. */
  failNextCommand(error: Error = new Error('command write failed')): void {
    this.commandFailure = error;
  }

  subscribeDeviceCommands(
    propertyId: string,
    roomId: string,
    callback: CommandListener,
  ): () => void {
    const key = `${propertyId}/${roomId}`;
    const forKey = this.commandListeners.get(key) ?? new Set<CommandListener>();
    forKey.add(callback);
    this.commandListeners.set(key, forKey);
    callback(this.commands.get(key) ?? {});
    return () => {
      forKey.delete(callback);
    };
  }

  async setDeviceCommand(
    propertyId: string,
    roomId: string,
    commandKey: DeviceCommandKey,
    on: boolean,
  ): Promise<void> {
    if (this.commandFailure) {
      const failure = this.commandFailure;
      this.commandFailure = null;
      throw failure;
    }
    const key = `${propertyId}/${roomId}`;
    this.emitDeviceCommands(propertyId, roomId, {
      ...(this.commands.get(key) ?? {}),
      [commandKey]: on,
    });
  }

  private automationEnabled = new Map<string, boolean>();
  private automationListeners = new Map<string, Set<(enabled: boolean) => void>>();

  subscribeAutomationEnabled(
    propertyId: string,
    roomId: string,
    callback: (enabled: boolean) => void,
  ): () => void {
    const key = `${propertyId}/${roomId}`;
    const forKey = this.automationListeners.get(key) ?? new Set<(enabled: boolean) => void>();
    forKey.add(callback);
    this.automationListeners.set(key, forKey);
    callback(this.automationEnabled.get(key) ?? false);
    return () => {
      forKey.delete(callback);
    };
  }

  async setAutomationEnabled(
    propertyId: string,
    roomId: string,
    enabled: boolean,
  ): Promise<void> {
    const key = `${propertyId}/${roomId}`;
    this.automationEnabled.set(key, enabled);
    this.automationListeners.get(key)?.forEach((listener) => listener(enabled));
  }

  async listAccessibleRooms(_session: Session): Promise<RoomRef[]> {
    return this.accessibleRooms;
  }

  emitLatest(propertyId: string, roomId: string, latest: RoomLatest): void {
    const key = `${propertyId}/${roomId}`;
    this.snapshots.set(key, latest);
    this.listeners.get(key)?.forEach((listener) => listener(latest));
  }

  subscribeLatest(
    propertyId: string,
    roomId: string,
    callback: Listener,
  ): () => void {
    const key = `${propertyId}/${roomId}`;
    const forKey = this.listeners.get(key) ?? new Set<Listener>();
    forKey.add(callback);
    this.listeners.set(key, forKey);
    callback(this.snapshots.get(key) ?? null);
    return () => {
      forKey.delete(callback);
    };
  }
}
