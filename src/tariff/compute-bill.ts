import type { Bill, Tariff, TariffBlock, TariffRegime } from './tariff';

const round2 = (n: number): number => Number(n.toFixed(2));

/** First regime whose ceiling covers the monthly total (null = unbounded top). */
function selectRegime(regimes: TariffRegime[], kWh: number): TariffRegime {
  return regimes.find((r) => r.upToKWh === null || kWh <= r.upToKWh) ?? regimes[regimes.length - 1];
}

/** The block the monthly total lands in — its fixed charge is the month's fixed charge. */
function landingBlock(blocks: TariffBlock[], kWh: number): TariffBlock {
  return blocks.find((b) => b.upToKWh === null || kWh <= b.upToKWh) ?? blocks[blocks.length - 1];
}

/**
 * Compute the monthly bill for a consumption (ADR-0008). Regime chosen by total;
 * `flat` charges the landing band's rate on ALL units, `slab` sums incremental
 * blocks; fixed charge comes from the landing block; SSCL grosses up the total.
 * RISK GATE #8: rates live in ceb-tariffs.ts (cited) and are human-reviewed.
 */
export function computeBill(tariff: Tariff, monthlyKWh: number): Bill {
  const kWh = Math.max(0, monthlyKWh);
  const regime = selectRegime(tariff.regimes, kWh);
  const fixedLKR = landingBlock(regime.blocks, kWh).fixedChargeLKR;

  let energy: number;
  if (regime.method === 'flat') {
    energy = kWh * landingBlock(regime.blocks, kWh).ratePerKWh;
  } else {
    energy = 0;
    let prevTop = 0;
    for (const block of regime.blocks) {
      const top = block.upToKWh === null ? Number.POSITIVE_INFINITY : block.upToKWh;
      energy += Math.max(0, Math.min(kWh, top) - prevTop) * block.ratePerKWh;
      prevTop = top;
      if (kWh <= top) break;
    }
  }

  const energyLKR = round2(energy);
  const beforeSsclLKR = round2(energyLKR + fixedLKR);
  return {
    energyLKR,
    fixedLKR,
    beforeSsclLKR,
    ssclLKR: round2(beforeSsclLKR * tariff.sscl),
    totalLKR: round2(beforeSsclLKR * (1 + tariff.sscl)),
  };
}

/**
 * The per-kWh rate that applies to the next unit at a given consumption — the
 * rate of the block the total currently lands in. Used to price marginal energy
 * (e.g. savings) WITHOUT the band-jump artifact a full bill-difference would add.
 */
export function marginalRatePerKWh(tariff: Tariff, monthlyKWh: number): number {
  const regime = selectRegime(tariff.regimes, Math.max(0, monthlyKWh));
  return landingBlock(regime.blocks, Math.max(0, monthlyKWh)).ratePerKWh;
}
