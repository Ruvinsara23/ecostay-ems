export type AlertThresholds = {
  temperatureC: number;
  waterLevelPct: number;
  acPowerThresholdW: number;
};

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  temperatureC: 33,
  waterLevelPct: 20,
  acPowerThresholdW: 500,
};

export function isValidTemperatureThreshold(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 50;
}

export function isValidWaterLevelThreshold(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

export function isValidPowerThreshold(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseAlertThresholds(raw: unknown): AlertThresholds | null {
  if (!isRecord(raw)) return null;
  if (!isValidTemperatureThreshold(raw.temperatureC)) return null;
  if (!isValidWaterLevelThreshold(raw.waterLevelPct)) return null;
  if (!isValidPowerThreshold(raw.acPowerThresholdW)) return null;
  return {
    temperatureC: raw.temperatureC,
    waterLevelPct: raw.waterLevelPct,
    acPowerThresholdW: raw.acPowerThresholdW,
  };
}

export function normalizeAlertThresholds(raw: unknown): AlertThresholds {
  if (!isRecord(raw)) return DEFAULT_ALERT_THRESHOLDS;
  return {
    temperatureC: isValidTemperatureThreshold(raw.temperatureC)
      ? raw.temperatureC
      : DEFAULT_ALERT_THRESHOLDS.temperatureC,
    waterLevelPct: isValidWaterLevelThreshold(raw.waterLevelPct)
      ? raw.waterLevelPct
      : DEFAULT_ALERT_THRESHOLDS.waterLevelPct,
    acPowerThresholdW: isValidPowerThreshold(raw.acPowerThresholdW)
      ? raw.acPowerThresholdW
      : DEFAULT_ALERT_THRESHOLDS.acPowerThresholdW,
  };
}
