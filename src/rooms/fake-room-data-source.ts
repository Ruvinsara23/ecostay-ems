import type { Session } from '@/auth/auth-gateway';
import type { DeviceCommandKey, DeviceCommands } from '@/telemetry/contract';
import type {
  AlertThresholds,
  AlertView,
  CircuitWattages,
  DailyAggregateView,
  EnergyHistorySample,
  EvaluationRun,
  EvaluationRunInput,
  RoomDataSource,
  RoomLatest,
  RoomRef,
} from './room-data-source';

type Listener = (latest: RoomLatest | null) => void;
type CommandListener = (commands: DeviceCommands) => void;

/** In-memory RoomDataSource for tests; the seeder for UI behavior. */
export class FakeRoomDataSource implements RoomDataSource {
  private snapshots = new Map<string, RoomLatest>();
  private listeners = new Map<string, Set<Listener>>();
  private accessibleRooms: RoomRef[] = [];
  private serverTimeOffsetMs = 0;
  private offsetListeners = new Set<(offsetMs: number) => void>();

  /** When true, the error-capable subscriptions fail immediately (audit A3 tests). */
  subscriptionFailure = false;

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

  private history = new Map<string, EnergyHistorySample[]>();
  private historyListeners = new Map<
    string,
    Set<{ sinceMs: number; callback: (samples: EnergyHistorySample[]) => void }>
  >();
  private aggregates = new Map<string, Record<string, DailyAggregateView>>();
  private aggregateListeners = new Map<
    string,
    Set<(byDate: Record<string, DailyAggregateView>) => void>
  >();

  emitEnergyHistory(propertyId: string, roomId: string, samples: EnergyHistorySample[]): void {
    const key = `${propertyId}/${roomId}`;
    this.history.set(key, samples);
    this.historyListeners
      .get(key)
      ?.forEach(({ sinceMs, callback }) =>
        callback(samples.filter((s) => s.sampledAt >= sinceMs)),
      );
  }

  subscribeEnergyHistory(
    propertyId: string,
    roomId: string,
    sinceMs: number,
    callback: (samples: EnergyHistorySample[]) => void,
    onError?: () => void,
  ): () => void {
    if (this.subscriptionFailure) {
      onError?.();
      return () => {};
    }
    const key = `${propertyId}/${roomId}`;
    const entry = { sinceMs, callback };
    const forKey =
      this.historyListeners.get(key) ?? new Set<typeof entry>();
    forKey.add(entry);
    this.historyListeners.set(key, forKey);
    callback((this.history.get(key) ?? []).filter((s) => s.sampledAt >= sinceMs));
    return () => {
      forKey.delete(entry);
    };
  }

  emitDailyAggregates(
    propertyId: string,
    roomId: string,
    byDate: Record<string, DailyAggregateView>,
  ): void {
    const key = `${propertyId}/${roomId}`;
    this.aggregates.set(key, byDate);
    this.aggregateListeners.get(key)?.forEach((listener) => listener(byDate));
  }

  subscribeDailyAggregates(
    propertyId: string,
    roomId: string,
    callback: (byDate: Record<string, DailyAggregateView>) => void,
    onError?: () => void,
  ): () => void {
    if (this.subscriptionFailure) {
      onError?.();
      return () => {};
    }
    const key = `${propertyId}/${roomId}`;
    const forKey =
      this.aggregateListeners.get(key) ??
      new Set<(byDate: Record<string, DailyAggregateView>) => void>();
    forKey.add(callback);
    this.aggregateListeners.set(key, forKey);
    callback(this.aggregates.get(key) ?? {});
    return () => {
      forKey.delete(callback);
    };
  }

  private tariffCategory = new Map<string, string | null>();
  private tariffListeners = new Map<string, Set<(category: string | null) => void>>();

  async setTariffCategory(propertyId: string, category: string | null): Promise<void> {
    this.tariffCategory.set(propertyId, category);
    this.tariffListeners.get(propertyId)?.forEach((listener) => listener(category));
  }

  subscribeTariffCategory(
    propertyId: string,
    callback: (category: string | null) => void,
  ): () => void {
    const forKey = this.tariffListeners.get(propertyId) ?? new Set<typeof callback>();
    forKey.add(callback);
    this.tariffListeners.set(propertyId, forKey);
    callback(this.tariffCategory.get(propertyId) ?? null);
    return () => {
      forKey.delete(callback);
    };
  }

  private wattages = new Map<string, CircuitWattages | null>();
  private wattageListeners = new Map<string, Set<(w: CircuitWattages | null) => void>>();

  async setCircuitWattages(propertyId: string, w: CircuitWattages): Promise<void> {
    this.wattages.set(propertyId, w);
    this.wattageListeners.get(propertyId)?.forEach((listener) => listener(w));
  }

  subscribeCircuitWattages(
    propertyId: string,
    callback: (w: CircuitWattages | null) => void,
  ): () => void {
    const forKey = this.wattageListeners.get(propertyId) ?? new Set<typeof callback>();
    forKey.add(callback);
    this.wattageListeners.set(propertyId, forKey);
    callback(this.wattages.get(propertyId) ?? null);
    return () => {
      forKey.delete(callback);
    };
  }

  private alertThresholds = new Map<string, AlertThresholds | null>();
  private alertThresholdListeners = new Map<
    string,
    Set<(thresholds: AlertThresholds | null) => void>
  >();

  async setAlertThresholds(propertyId: string, thresholds: AlertThresholds): Promise<void> {
    this.alertThresholds.set(propertyId, thresholds);
    this.alertThresholdListeners
      .get(propertyId)
      ?.forEach((listener) => listener(thresholds));
  }

  subscribeAlertThresholds(
    propertyId: string,
    callback: (thresholds: AlertThresholds | null) => void,
  ): () => void {
    const forKey = this.alertThresholdListeners.get(propertyId) ?? new Set<typeof callback>();
    forKey.add(callback);
    this.alertThresholdListeners.set(propertyId, forKey);
    callback(this.alertThresholds.get(propertyId) ?? null);
    return () => {
      forKey.delete(callback);
    };
  }

  private alerts = new Map<string, AlertView[]>();
  private alertListeners = new Map<string, Set<(alerts: AlertView[]) => void>>();

  emitAlerts(propertyId: string, alerts: AlertView[]): void {
    this.alerts.set(propertyId, alerts);
    this.alertListeners.get(propertyId)?.forEach((listener) => listener(alerts));
  }

  subscribeAlerts(
    propertyId: string,
    callback: (alerts: AlertView[]) => void,
    onError?: () => void,
  ): () => void {
    if (this.subscriptionFailure) {
      onError?.();
      return () => {};
    }
    const forKey = this.alertListeners.get(propertyId) ?? new Set<typeof callback>();
    forKey.add(callback);
    this.alertListeners.set(propertyId, forKey);
    callback(this.alerts.get(propertyId) ?? []);
    return () => {
      forKey.delete(callback);
    };
  }

  async acknowledgeAlert(propertyId: string, alertId: string, uid: string): Promise<void> {
    const updated = (this.alerts.get(propertyId) ?? []).map((alert) =>
      alert.id === alertId
        ? { ...alert, acknowledgedBy: uid, acknowledgedAt: Date.now() }
        : alert,
    );
    this.emitAlerts(propertyId, updated);
  }

  private evaluationRuns = new Map<string, EvaluationRun[]>();
  private evaluationListeners = new Map<string, Set<(runs: EvaluationRun[]) => void>>();
  private nextRunId = 1;

  emitEvaluationRuns(propertyId: string, roomId: string, runs: EvaluationRun[]): void {
    const key = `${propertyId}/${roomId}`;
    this.evaluationRuns.set(key, runs);
    this.evaluationListeners.get(key)?.forEach((listener) => listener(runs));
  }

  subscribeEvaluationRuns(
    propertyId: string,
    roomId: string,
    callback: (runs: EvaluationRun[]) => void,
    onError?: () => void,
  ): () => void {
    if (this.subscriptionFailure) {
      onError?.();
      return () => {};
    }
    const key = `${propertyId}/${roomId}`;
    const forKey = this.evaluationListeners.get(key) ?? new Set<typeof callback>();
    forKey.add(callback);
    this.evaluationListeners.set(key, forKey);
    callback(this.evaluationRuns.get(key) ?? []);
    return () => {
      forKey.delete(callback);
    };
  }

  async startEvaluationRun(
    propertyId: string,
    roomId: string,
    input: EvaluationRunInput,
  ): Promise<string> {
    const key = `${propertyId}/${roomId}`;
    const id = `run_${this.nextRunId++}`;
    const run: EvaluationRun = {
      id,
      label: input.label,
      automationEnabled: input.label === 'ecostay',
      startedAt: Date.now(),
      startEnergyKWh: input.startEnergyKWh,
    };
    // Baseline turns automation off, EcoStay turns it on — the experiment's control.
    await this.setAutomationEnabled(propertyId, roomId, run.automationEnabled);
    this.emitEvaluationRuns(propertyId, roomId, [
      ...(this.evaluationRuns.get(key) ?? []),
      run,
    ]);
    return id;
  }

  async endEvaluationRun(
    propertyId: string,
    roomId: string,
    runId: string,
    endEnergyKWh: number,
  ): Promise<void> {
    const key = `${propertyId}/${roomId}`;
    const runs = (this.evaluationRuns.get(key) ?? []).map((run) =>
      run.id === runId ? { ...run, endedAt: Date.now(), endEnergyKWh } : run,
    );
    this.emitEvaluationRuns(propertyId, roomId, runs);
  }

  async deleteEvaluationRun(propertyId: string, roomId: string, runId: string): Promise<void> {
    const key = `${propertyId}/${roomId}`;
    const runs = (this.evaluationRuns.get(key) ?? []).filter((run) => run.id !== runId);
    this.emitEvaluationRuns(propertyId, roomId, runs);
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
    onError?: () => void,
  ): () => void {
    if (this.subscriptionFailure) {
      onError?.();
      return () => {};
    }
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
