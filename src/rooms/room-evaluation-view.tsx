'use client';

import { useEffect, useState } from 'react';
import { CEB_TARIFFS } from '@/tariff/ceb-tariffs';
import { compareEvaluationRuns, runKWh } from '@/tariff/validation';
import { Badge } from '@/ui/badge';
import type { EvaluationRun, EvaluationRunLabel, RoomLatest } from './room-data-source';
import { useRoomDataSource } from './room-data-source-context';

const LABELS: Record<EvaluationRunLabel, string> = {
  baseline: 'Baseline',
  ecostay: 'EcoStay',
};

function durationLabel(startedAt: number, endedAt?: number): string {
  if (!endedAt) return 'running…';
  const mins = Math.max(0, Math.round((endedAt - startedAt) / 60_000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h} h ${mins % 60} min`;
}

/**
 * §10.2 A/B experiment runner (owner dashboard v2): record a Baseline run
 * (automation OFF) and an EcoStay run (automation ON), each capturing the room's
 * MEASURED cumulative energy over its window, then compare. A real reduction
 * needs the PZEM meter — until it's wired both runs read the simulated signal.
 */
export function RoomEvaluationView({
  propertyId,
  roomId,
  roomName,
}: {
  propertyId: string;
  roomId: string;
  roomName?: string;
}) {
  const source = useRoomDataSource();
  const [runs, setRuns] = useState<EvaluationRun[]>([]);
  const [latest, setLatest] = useState<RoomLatest | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(
    () => source.subscribeEvaluationRuns(propertyId, roomId, setRuns, () => setError('Couldn’t load evaluation runs.')),
    [source, propertyId, roomId],
  );
  useEffect(
    () => source.subscribeLatest(propertyId, roomId, setLatest),
    [source, propertyId, roomId],
  );
  useEffect(() => source.subscribeTariffCategory(propertyId, setCategory), [source, propertyId]);

  const currentEnergyKWh = latest?.energy;
  const canCapture = typeof currentEnergyKWh === 'number';
  const inProgress = runs.find((run) => run.endedAt === undefined) ?? null;
  const completed = runs.filter((run) => run.endedAt !== undefined);
  const lastOf = (label: EvaluationRunLabel) =>
    completed.filter((run) => run.label === label).sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
  const tariff = category ? CEB_TARIFFS[category] : undefined;
  const comparison = compareEvaluationRuns(lastOf('baseline'), lastOf('ecostay'), tariff);

  async function start(label: EvaluationRunLabel) {
    if (!canCapture) return;
    setError(null);
    setBusy(true);
    try {
      await source.startEvaluationRun(propertyId, roomId, {
        label,
        startEnergyKWh: currentEnergyKWh as number,
      });
    } catch {
      setError('Couldn’t start the run — try again.');
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!inProgress || !canCapture) return;
    setError(null);
    setBusy(true);
    try {
      await source.endEvaluationRun(propertyId, roomId, inProgress.id, currentEnergyKWh as number);
    } catch {
      setError('Couldn’t stop the run — try again.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(runId: string) {
    setError(null);
    try {
      await source.deleteEvaluationRun(propertyId, roomId, runId);
    } catch {
      setError('Couldn’t delete the run — try again.');
    }
  }

  return (
    <section
      aria-label={`Evaluation for ${roomName ?? roomId}`}
      className="relative h-full w-full overflow-y-auto bg-transparent"
    >
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-brand/5 to-transparent opacity-50" />
      <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 pointer-events-none flex flex-col items-center gap-1">
        <span className="text-sm font-bold tracking-tight text-ink">{roomName ?? roomId}</span>
        <span className="text-[11px] font-medium text-ink-3">Evaluation</span>
      </div>

      <div className="relative z-10 flex flex-col p-6 pt-24">
        <div className="mx-auto grid w-full max-w-2xl gap-6">
          {/* Result */}
          <section className="glass rounded-[1.25rem] p-6 shadow-sm bg-white/60">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-ink">Energy Savings Evaluation</h2>
                <p className="text-xs text-ink-3">Proposal §10.2 · A/B experiment · target ≥ 20%</p>
              </div>
              {comparison && (
                <Badge tone={comparison.passed ? 'success' : 'warn'}>
                  {comparison.passed ? 'Target met' : 'Below target'}
                </Badge>
              )}
            </div>

            {comparison ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm [font-variant-numeric:tabular-nums]">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                      <th className="py-1.5 font-semibold">Measured</th>
                      <th className="py-1.5 text-right font-semibold">Baseline</th>
                      <th className="py-1.5 text-right font-semibold">EcoStay</th>
                    </tr>
                  </thead>
                  <tbody className="text-ink">
                    <tr className="border-t border-hairline">
                      <td className="py-1.5 text-ink-2">Energy used</td>
                      <td className="py-1.5 text-right">{comparison.baselineKWh} kWh</td>
                      <td className="py-1.5 text-right">{comparison.ecostayKWh} kWh</td>
                    </tr>
                  </tbody>
                </table>
                <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
                  <span className="text-2xl font-bold text-ink [font-variant-numeric:tabular-nums]">
                    {comparison.reductionPct}%
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                    reduction (target {comparison.targetPct}%)
                  </span>
                  {comparison.savedLKR !== null && (
                    <span className="text-sm font-semibold text-brand-deep">
                      Rs {comparison.savedLKR} saved
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-ink-2">
                Run a <strong>Baseline</strong> and an <strong>EcoStay</strong> phase to see the
                comparison. A real reduction needs the PZEM meter — until it’s wired both runs read
                the simulated energy signal.
              </p>
            )}
          </section>

          {/* Controls */}
          <section className="glass rounded-[1.25rem] p-6 shadow-sm bg-white/60">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-ink">Experiment control</h3>
              <span className="text-xs text-ink-3 [font-variant-numeric:tabular-nums]">
                Meter: {canCapture ? `${currentEnergyKWh} kWh` : '—'}
              </span>
            </div>

            {inProgress ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-soft px-4 py-3">
                <div className="text-sm">
                  <span className="font-bold text-ink">{LABELS[inProgress.label]} run in progress</span>
                  <span className="block text-xs text-ink-2">
                    Automation {inProgress.automationEnabled ? 'ON' : 'OFF'} · {durationLabel(inProgress.startedAt)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={stop}
                  disabled={busy || !canCapture}
                  className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-brand-deep disabled:opacity-50"
                >
                  Stop run
                </button>
              </div>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => start('baseline')}
                  disabled={busy || !canCapture}
                  className="rounded-2xl border border-hairline bg-white/70 px-4 py-3 text-left transition-colors hover:bg-white disabled:opacity-50"
                >
                  <span className="block text-sm font-bold text-ink">Start Baseline run</span>
                  <span className="block text-xs text-ink-3">Automation OFF — appliances left on</span>
                </button>
                <button
                  type="button"
                  onClick={() => start('ecostay')}
                  disabled={busy || !canCapture}
                  className="rounded-2xl border border-brand/40 bg-brand-soft px-4 py-3 text-left transition-colors hover:bg-brand/15 disabled:opacity-50"
                >
                  <span className="block text-sm font-bold text-ink">Start EcoStay run</span>
                  <span className="block text-xs text-ink-3">Automation ON — cuts on vacancy</span>
                </button>
              </div>
            )}

            {!canCapture && (
              <p className="mt-3 text-xs text-ink-3">
                Waiting for the device to report its energy reading before a run can start.
              </p>
            )}
            {error && (
              <p role="alert" className="mt-3 text-xs font-semibold text-alarm">
                {error}
              </p>
            )}
          </section>

          {/* Recorded runs */}
          {completed.length > 0 && (
            <section className="glass rounded-[1.25rem] p-6 shadow-sm bg-white/60">
              <h3 className="mb-3 text-sm font-bold text-ink">Recorded runs</h3>
              <ul className="flex flex-col divide-y divide-hairline">
                {[...completed]
                  .sort((a, b) => b.startedAt - a.startedAt)
                  .map((run) => {
                    const kWh = runKWh(run);
                    return (
                      <li
                        key={run.id}
                        className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                      >
                        <span className="flex items-center gap-2">
                          <Badge tone={run.label === 'ecostay' ? 'brand' : 'neutral'}>
                            {LABELS[run.label]}
                          </Badge>
                          <span className="text-xs text-ink-3">
                            {durationLabel(run.startedAt, run.endedAt)} · auto{' '}
                            {run.automationEnabled ? 'on' : 'off'}
                          </span>
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-ink [font-variant-numeric:tabular-nums]">
                            {kWh === null ? '—' : `${kWh} kWh`}
                          </span>
                          <button
                            type="button"
                            onClick={() => remove(run.id)}
                            className="text-xs font-semibold text-ink-3 transition-colors hover:text-alarm"
                          >
                            Delete
                          </button>
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}
