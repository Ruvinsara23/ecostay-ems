go# 02 - Admin settings: alert thresholds

Status: ready-for-human (implemented 2026-07-07 - rules re-publish required)
Slice: 2 of 4 · Parent: `.scratch/admin-console/PRD.md`

> Goal: extend the existing admin settings surface so Admins can edit the server-side
> temperature and water-level alert thresholds from the product. Keep the UI visually
> aligned with the Owner dashboard and current `/admin` settings form: same glass panels,
> compact inputs, Inter typography, lavender/purple treatment, and calm status feedback.
>
> Implemented (TDD): shared alert-threshold defaults/validation, `RoomDataSource`
> subscribe/write methods, fake + Firebase adapters, Admin UI threshold section,
> tick evaluator reads per-property settings with malformed-setting fallback, and
> admin-only validated RTDB rules. Rendered desktop/mobile preview verified; mobile
> CDP metrics showed no horizontal overflow.
> **Human: re-publish `database.rules.json` in Firebase before admins can save these
> settings on prod.**

## Risk gate approval

Approved by the human on 2026-07-07 ("go for it") for **risk gate #2** because this
introduces a new dashboard-owned RTDB settings path under `properties/*` and updates
`database.rules.json`.

Proposed path:

```text
properties/{propertyId}/settings/alertThresholds/temperatureC
properties/{propertyId}/settings/alertThresholds/waterLevelPct
```

Proposed rules behavior:

- Admins may write the two numeric threshold leaves.
- Owners may read the resulting settings through existing property access, but may not write them.
- `temperatureC` validates as a number in a sane DHT11 range.
- `waterLevelPct` validates as a number from 0 to 100.
- No other children are accepted under `alertThresholds`.

Gas is intentionally **not** editable here. The firmware's local gas alarm uses its fixed
`> 300` threshold and handles buzzer/fan safety locally; the dashboard should not imply that
Admins can change that safety boundary.

## What to build

- Extend `/admin` with an "Alert thresholds" section in the same Admin settings page.
- Show current temperature and water-level thresholds with defaults when the setting is absent:
  - temperature: `33` °C
  - water level: `20` %
- Save threshold changes through the `RoomDataSource` port.
- Update the 1-minute tick alert evaluator to read the configured thresholds per property,
  falling back to the current defaults if absent or malformed.
- Keep offline alert timing unchanged at 90 seconds.
- Keep gas alert threshold unchanged from the firmware contract.

## Acceptance criteria

- [ ] Admins see tariff, wattage, and alert-threshold settings in one coherent `/admin` surface.
- [ ] Owners remain redirected away from `/admin`.
- [ ] Temperature alert opens only above the configured `temperatureC` value.
- [ ] Water-level alert opens only below the configured `waterLevelPct` value.
- [ ] Missing or malformed threshold settings fall back to the default values.
- [ ] Emulator rules prove admin writes are allowed, owner writes are denied, invalid values reject.
- [ ] UI imports the port only; no Firebase SDK imports in Admin UI.
- [ ] `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` are green.
- [ ] Rendered `/admin` is screenshot-checked so it matches the Owner-side visual language.

## Verification

- `npm test` - 179 passed
- `npm run test:integration` - 35 passed (required elevated run for Firebase CLI config)
- `npm run typecheck` - green
- `npm run lint` - green with existing `<img>` warnings only
- `npm run build` - green after elevated font fetch
- Headless Chrome preview: desktop + mobile screenshot checked; mobile layout metrics:
  `scrollWidth === clientWidth`

## Blocked by

Human must re-publish `database.rules.json` in Firebase console for production rules.
