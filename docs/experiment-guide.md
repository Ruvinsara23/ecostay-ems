# EcoStay EMS — §10.2 Energy-Savings Experiment: Field Guide

**Goal:** prove, with real measured data, that EcoStay's vacancy-cutoff automation reduces a
room's energy use by **≥ 20%** (Proposal §10.2), using the dashboard's **Evaluation tab** as the
experiment instrument.

**Method:** two equal windows in the same room under the same occupancy script —
**Baseline** (automation OFF, appliances left running) then **EcoStay** (automation ON, lights +
exhaust fan cut automatically when the room is confirmed vacant). The dashboard records the
energy-meter reading at the start and end of each window and compares the two **energy rates
(kWh/h)**. Everything in this guide is grounded in the code; file:line references are given so
each claim can be checked (and cited in the thesis).

---

## Part 0 — How the experiment works (read this first)

```
 Guest + room                    ESP32 node                        Firebase RTDB                Dashboard
 ───────────                     ──────────                        ─────────────                ─────────
 PIR / door / ultrasonic  ──►  occupancy state machine  ──every 3 s──►  rooms/room_001/latest  ──►  Evaluation tab
 lights + fan (relays)    ◄──  polls devices/* every 0.5 s  ◄──────────  rooms/room_001/devices ◄──  vacancy cutoff
 PZEM-004T energy meter   ──►  real V/A/W/kWh reads every 3 s ──►  latest.energy  ──►  start/end meter readings
                                                                        ▲
                                              Vercel cron jobs (cron-job.org):
                                              /api/cron/tick   every 1 min  → vacancy cutoff
                                              /api/cron/sample every 5 min  → energyHistory audit log
                                              /api/cron/rollup 00:05 Colombo → dailyAggregates
```

1. You press **Start Baseline run** on the Evaluation tab. The dashboard records the meter's
   cumulative kWh (`latest.energy`) + a server timestamp, and **automatically switches
   automation OFF** for the room — both in one atomic write
   (`src/rooms/firebase-room-data-source.ts:232-248`).
2. The "guest" follows a fixed occupancy script (in the room / out of the room), leaving the
   lights + exhaust fan ON when they walk out. Nothing turns them off. You press **Stop run**.
3. You press **Start EcoStay run** — same recording, but automation is **switched ON**. Same
   occupancy script. Now, each time the guest leaves, the server's vacancy cutoff turns the
   lights + exhaust fan off within **~31–94 seconds** (derivation in Part 2.4). You press
   **Stop run**.
4. The Evaluation card computes `reduction % = (baselineRate − ecostayRate) / baselineRate` on
   the two windows' kWh/h rates and shows **"Target met"** when the reduction is ≥ 20%
   (`src/tariff/validation.ts:107-165`).

**What you must have working:** the PZEM energy meter (the measurement), the door + PIR sensors
(the vacancy detection), the relays (the actuation), and the cron jobs (the automation brain).
Part 1 sets all of this up.

> **Do we need to build anything else in the dashboard?** No. The mechanism is complete in
> code. The pending items are hardware + configuration only (Part 1) — plus one **2-minute
> blocker in the Firebase console** (Step 1.1).

---

## Part 1 — One-time setup (do all of this BEFORE experiment day)

### 1.1 ⛔ BLOCKER: republish the database rules

The security rule that allows the Evaluation tab to write runs (`evaluationRuns`) exists only in
the repo copy of `database.rules.json` — it has **not been published** to Firebase yet
(`docs/HANDOFF.md:76-80`). Until you publish it, **Start run fails with PERMISSION_DENIED** in
production.

1. Open the [Firebase console](https://console.firebase.google.com) → project **ecostay-ems** →
   **Realtime Database** → **Rules** tab.
2. Replace the rules with the full contents of the repo's `database.rules.json` (it is the
   canonical copy).
3. Click **Publish**.
4. Verify: sign in to <https://ecostay-ems.vercel.app> as the owner, open Room 1 → Evaluation
   tab. The Start buttons must not throw a "permission denied" error when pressed (they may
   still be greyed out until the device is online — that is a different, expected gate).

### 1.2 Hardware: wire the node (pin map from `firmware/complete.ino:55-80,164-169`)

| Component | ESP32 pin | Notes |
|---|---|---|
| **PZEM-004T v3.0 energy meter** | **RX2 = GPIO 16 ← PZEM TX, TX2 = GPIO 17 → PZEM RX** | 5 V logic pair + the AC side: the PZEM's voltage terminals across the room circuit's L/N and its CT coil around the live wire. **Mains wiring — get help if unsure; this is the one dangerous step.** |
| Relay IN1 — **lights** | GPIO 13 | Board must be **active-LOW** (`RELAY_ACTIVE_LOW true`, line 61) — the standard 4-channel opto board. |
| Relay IN2 — water pump | GPIO 5 | Not part of this experiment. |
| Relay IN3 — **exhaust fan** | GPIO 26 | Second controlled circuit. |
| Relay IN4 — presence indicator | GPIO 14 | Not a savings circuit. |
| **Door reed switch** | GPIO 33 | **Essential** — vacancy is only ever confirmed through a door event (see 2.4). Pin is plain `INPUT` (line 929) so add an external pull-up to 3V3. The firmware reads **LOW = door open, HIGH = door closed**. Wire/orient the reed so the pin sits HIGH when the door is shut, then **verify on serial that it prints `DOOR … CLOSED` with the door physically closed** before trusting vacancy detection. |
| **PIR motion sensor** | GPIO 27 | Presence detection. |
| Ultrasonic HC-SR04 | TRIG 18 / ECHO 19 | Anything within **50 cm** counts as a person (`complete.ino:502`) — aim it so nothing sits permanently in front of it, or vacancy will never confirm. |
| Gas sensor (MQ) | GPIO 32 (analog) | Above 300 ppm the firmware **forces the exhaust fan ON** locally (`complete.ino:425,600`) — a warm-up false alarm can corrupt a window. Let it warm up ≥ 10 min and confirm gas < 300 on the Live View before starting. |
| Water level / flow | GPIO 34 / 35 | Not part of this experiment. |
| DHT11 temp/humidity | GPIO 4 | Not part of this experiment. |
| Buzzer | GPIO 25 | Beeps on every motion/door event. For a quiet run you may unplug the buzzer wire — it has no role in the measurement. |

**What loads to connect (experiment design):**

- Put the **lights** circuit (through relay IN1) and the **exhaust fan** (through relay IN3) on
  the PZEM-measured supply. Use real loads totalling **≥ 100 W combined** (e.g. 60 W of bulbs +
  a 45 W fan). The dashboard records kWh to 3 decimal places (`src/tariff/validation.ts:83-87`),
  so bigger loads + longer windows = a cleaner signal.
- Keep **uncontrolled** loads on the measured circuit to a minimum, and identical across both
  windows — they dilute the measured reduction percentage.
- **Measure the true wattage** of what you connected (nameplate or a plug meter). You will
  enter these numbers in the Admin console in Step 1.4.

### 1.3 Flash + provision the ESP32

1. In `firmware/complete.ino` set your WiFi in `WIFI_SSID` / `WIFI_PASSWORD` (lines 14–15 hold
   placeholders). **Never commit the real values.**
2. Flash the sketch. Open the Serial Monitor at **115200 baud**.
3. The device needs its identity + login (stored in flash, not in the sketch). **Two ways —
   don't mix them:**
   - **One-liner (easiest):** let the sketch boot normally, then at any time type this single
     line into the Serial Monitor and press Enter (`handleSerialCommand`, `complete.ino:843-993`):

     ```
     SET_CONFIG property_001 room_001 device+property_001+room_001@devices.ecostay.local <devicePassword>
     ```
   - **Interactive wizard:** press `p` within **5 s of boot** — the firmware then asks four
     questions one at a time (Property ID, Room ID, Device Email, Device Password;
     `promptProvisioning`, `complete.ino:782-814`). Answer each and press Enter.

   ⚠ Do **not** paste the `SET_CONFIG …` line at the `p` prompt — the wizard would store the
   whole line as the Property ID and misprovision the device. Use one method or the other.
   The device email/password come from the Admin console's room provisioning (Admin → Rooms).
   `PRINT_CONFIG` shows what is stored; `CLEAR_CONFIG` wipes it.
4. Verify on serial: WiFi connected, then a heartbeat every 3 s like `Upload OK | … W … kWh`.
   **The W / kWh values must be non-zero** when your loads are on — if they read 0.0, the PZEM
   is not answering (check the GPIO16/17 crossover and the AC side). With a dead PZEM the
   firmware reports honest zeros forever (`complete.ino:286-319`) and **the whole experiment
   would compare 0 vs 0**.

### 1.4 Configure the property in the Admin console

Sign in as **admin** → `https://ecostay-ems.vercel.app/admin` → **Properties** → open the
property → scroll to the settings form at the bottom (`src/admin/admin-property-detail.tsx:478-482`):

1. **Billing → Tariff category:** select **H-1** (SLTDA-approved hotel). Careful: the select
   shows D-1 while unset — don't save the default by accident
   (`src/admin/admin-property-settings.tsx:56-74`).
2. **Controlled circuits:** enter the **real measured wattages** from Step 1.2 into
   **Lights (W)** and **Exhaust fan (W)**. These drive the modelled savings card and the
   monthly "Saved" figure — wrong values = wrong thesis numbers. (Seed defaults are 60/45 W.)
3. **Save.** (These two settings are admin-only writes — the owner account cannot set them;
   `database.rules.json:81-92`.)

### 1.5 Verify the cron jobs are alive

The vacancy cutoff runs **on the server**, once a minute, triggered by cron-job.org
(`docs/adr/0010`). If the cron job is paused, **the EcoStay window silently behaves like a
baseline** — no cutoffs ever fire.

1. Log in to your cron-job.org account → check all three jobs are enabled and their execution
   history is green: `tick` (every 1 min), `sample` (every 5 min), `rollup` (daily 00:05
   Asia/Colombo).
2. Optional direct test (PowerShell, using your CRON_SECRET from Vercel):

   ```powershell
   # Use curl.exe, not the `curl` alias — Windows PowerShell aliases curl to Invoke-WebRequest,
   # whose -H flag is not the same and will error.
   curl.exe -H "Authorization: Bearer <CRON_SECRET>" https://ecostay-ems.vercel.app/api/cron/sample
   # expect: {"sampled":1,"skippedNoData":0,"skippedStale":0}
   ```

### 1.6 Pre-flight checklist (day of experiment, before the first run)

| # | Check | Where | Pass condition |
|---|---|---|---|
| 1 | Rules published | Firebase console → Rules | `evaluationRuns` block visible in the live rules |
| 2 | Device online | Owner dashboard → Room 1 | Live View shows fresh data; Evaluation tab shows **Meter: \<number\> kWh** with no red "offline" tag |
| 3 | Meter reads real power | Evaluation tab / serial | kWh value increases while your loads are ON |
| 4 | Occupancy reacts | Live View | State changes when you walk in/out and open/close the door |
| 5 | Relays actuate | Devices tab | Toggling **Lights** / **Exhaust fan** physically switches the loads |
| 6 | Gas is calm | Live View | gas < 300 (MQ sensor warmed up ≥ 10 min) |
| 7 | Cron green | cron-job.org | tick + sample executed in the last few minutes |
| 8 | Wattages set | Admin → property settings | Real values in Lights (W) / Exhaust fan (W) |
| 9 | Nothing parked < 50 cm in front of the ultrasonic | The room | Room can reach VACANT_CONFIRMED |

---

## Part 2 — Running the experiment

### 2.1 Design the two windows

- **Equal length.** If the two windows differ by more than **20%**, the card flags the pair as
  "not a valid §10.2 pair" (`src/tariff/validation.ts:61,140-142`). Recommended: **2 hours
  each**, same day, back-to-back or same time-of-day.
- **Same occupancy script in both.** Recommended script per 2-hour window — two cycles of:
  - **30 min occupied:** guest inside, lights + exhaust fan ON, normal movement.
  - **30 min vacant:** guest walks out (door open → close) and stays away.
- **One room:** `property_001 / room_001` — the only fully provisioned room, and the only room
  whose rules allow the run's atomic write (`database.rules.json:18-23` vs `37-56`).
- **Who plays the guest:** anyone, but the same person + same behaviour in both windows.
- Write down planned times in your lab notebook; the dashboard stamps the official
  server-side times for you.

### 2.2 The Baseline run (automation OFF)

1. **Sign in first** (as the owner), *then* open **Room 1** from Home → left rail →
   **Evaluation**. The deep link
   `https://ecostay-ems.vercel.app/?tab=evaluation&pid=property_001&rid=room_001` only lands on
   the tab if you're already signed in — pasting it while signed out drops the parameters at the
   login redirect, and an admin session bounces from bare `/` to the admin console.
2. Check the header: **Meter: \<kWh\>** and no "offline" tag. (Buttons are disabled if the
   device hasn't reported within 15 s — `src/telemetry/device-freshness.ts:2`.)
3. On the **Devices** tab, turn **Lights** and **Exhaust fan** ON.
4. Back on Evaluation, press **"Start Baseline run — Automation OFF — appliances left on."**
   The dashboard records the meter reading + server timestamp and disables automation for
   the room. Do **not** touch the automation toggle yourself — the button does it.
5. Run the occupancy script (2.1). When the guest leaves, **the lights + fan stay ON** — that
   is the point of the baseline. Nobody touches the Devices tab or the room's toggles during
   the window.
6. After exactly 2 h, confirm the meter is live (no offline tag) and press **Stop run**.
   The run appears under **Recorded runs** with its measured kWh.

**Do not** power-cycle the ESP32 mid-run. Start/stop each need a live reading, and a reboot
that interrupts the meter makes the run invalid (shows "—", `src/tariff/validation.ts:83-87`).

### 2.3 The EcoStay run (automation ON)

1. Same tab. Press **"Start EcoStay run — Automation ON — cuts on vacancy."**
2. **Critical:** the cutoff is edge-triggered — it fires only when the server *observes a
   transition into* VACANT_CONFIRMED (`src/server/automation.ts:51-55`). A guest already
   inside when you press Start is fine (their first exit still produces the transition). The
   one case that fails is starting the EcoStay run while the room is **already** confirmed
   vacant and stays that way — then no transition is ever observed. So begin the EcoStay run
   with the room **occupied**, lights + fan ON, and run the same script.
3. Each time the guest exits (door open → walk out → door close), watch the dashboard: within
   **~31–94 s** the Lights and Exhaust fan toggles flip OFF by themselves and the loads
   physically switch off. That is the automation working — this moment is worth filming for
   the viva.
4. When the guest re-enters for the next occupied block, they turn Lights + fan back ON from
   the **Devices** tab (the realistic "guest walks in and switches things on" step).
5. After exactly 2 h, press **Stop run**.

### 2.4 Where the 31–94 s comes from (cite this in the thesis)

| Stage | Time | Source |
|---|---|---|
| Door closes behind guest → firmware confirms vacancy (EXIT_PENDING → VACANT_CONFIRMED, 30 s with no PIR/ultrasonic hit) | 30 s | `firmware/complete.ino:563-570` |
| Firmware uploads the new state to `latest` | ≤ 3 s | `FIREBASE_INTERVAL = 3000`, line 206 |
| Next 1-minute server tick observes the transition | 0–60 s | `docs/adr/0010`, `src/app/api/cron/tick/route.ts` |
| Firmware polls the OFF commands | ≤ 0.5 s | `COMMAND_INTERVAL = 500`, line 207 |
| **Total** | **≈ 31–94 s** | |

### 2.5 Reading the result

The **Energy Savings Evaluation** card at the top of the Evaluation tab now shows
(`src/rooms/room-evaluation-view.tsx:144-199`):

- Headline **reduction %** (computed on kWh/h rates) and the target (20%).
- Badge: **Target met** (green) or **Below target**.
- The Measured table: baseline kWh vs EcoStay kWh.
- Footnote with both rates and both durations.
- **"Rs … saved"** appears as soon as the tariff category is set **and** both runs are
  recorded — no rollup, no overnight wait (the Evaluation card always passes a numeric
  month-to-date total, defaulting to zero, so it never withholds the figure). With no
  month-to-date consumption yet the CEB band is simply priced at the lowest band. The
  pass/fail verdict does not depend on the rupee figure either way.

The comparison always uses the **most recent completed run of each label**. If a run went wrong
(reboot, wrong script), delete it in the Recorded runs list and re-run that window — a bad
*latest* run is the one that pollutes the card.

**Worked example** (what to expect with 105 W controlled load, 2 h windows, 50% vacancy):
baseline ≈ 105 W × 2 h = 0.210 kWh; EcoStay ≈ 105 W × (1 h occupied + ~3 min cutoff latency)
≈ 0.110 kWh → reduction ≈ **47%** — comfortably past the 20% target. Real numbers vary with
your loads and script; what matters is that vacancy time × controlled wattage is the saving.

### 2.6 Window-integrity checks (a "valid" run can still be silently wrong)

The dashboard cannot detect any of these — they leave the run looking complete. Watch for them
live; if one happens, **re-run that window.**

- **Meter froze mid-run.** If the PZEM loses its GPIO16/17 connection or browns out, the
  firmware keeps re-uploading its *last good* kWh forever — device still shows online, buttons
  stay enabled, the run completes with a too-low frozen number (`complete.ino:298-307`). At
  **every 30-minute transition, confirm the Meter kWh has actually increased** and Live-View W
  isn't stuck at an identical value. Serial prints `PZEM: N failed reads` when this is happening.
- **The exit was missed.** If the PIR hold-time or a sightline through the closing door keeps
  presence "true," the state bounces back to occupied and can settle in `OCCUPIED_SLEEPING` —
  which has **no timeout to vacancy** (`complete.ino:557-561`). No cutoff fires for that whole
  vacancy block. After **every** scripted exit, confirm on Live View that the state reaches
  **VACANT_CONFIRMED within ~45 s**; if it sticks at any OCCUPIED_* state, redo the door
  open/close.
- **False vacancy with the guest inside.** On entry, move visibly in front of the PIR within
  ~10 s of the door closing, or `ENTRY_DETECTED` jumps straight to VACANT_CONFIRMED
  (`complete.ino:540-541`). During occupied blocks, don't open the door for someone and then sit
  still — a door event + 30 s of stillness confirms vacancy and, in the EcoStay window, cuts the
  loads on an occupied room.
- **WiFi dropped mid-window.** The automation tick skips rooms silent > 90 s
  (`src/server/alerts.ts:12`); a vacancy that happens entirely during an outage gets its cutoff
  delayed or skipped, quietly diluting the reduction. Treat any device-offline gap in Live View
  during a window as grounds to redo it.
- **Gas spiked mid-window.** Above 300 the firmware forces the exhaust fan physically ON while
  every dashboard surface *and the audit log* still say it's off (`complete.ino:600`) — inflating
  EcoStay kWh and contradicting your §3.2 relay evidence. Keep an eye on the gas reading through
  both windows (fumes, aerosols, coils), not just at warm-up.
- **One operator, one browser tab.** A second Start from another tab/person creates an
  overlapping run and atomically flips the room's automation mode under your open run
  (`firebase-room-data-source.ts:232-248`). Nobody else should touch the Evaluation tab or the
  Routines automation toggle while a run is open.
- **Loads over ~500 W → expect an "AC Left On" alert.** Every baseline vacancy block will open
  that alert and push a notification (`src/server/alerts.ts` threshold 500 W). It's cosmetic for
  the measurement — **ignore it, don't act on it** mid-run; acknowledge it afterwards.

### 2.7 Close out cleanly

- An **in-progress run is a server-side lock**: it survives page refresh, closing the laptop, and
  overnight, and while it's open **both Start buttons are hidden**. There is no "delete" for an
  *unfinished* run in the UI. If a run is ever orphaned against a dead device (Stop is disabled
  while offline), clear it manually in the Firebase console at
  `properties/property_001/rooms/room_001/evaluationRuns/<id>`.
- **Stop does not restore automation.** After your last run the room stays in that run's mode
  (a baseline last leaves automation **OFF**). For the ongoing deployment / viva demo, go to
  **Routines → Vacancy cutoff automation** and set the toggle back to your intended state.

---

## Part 3 — Collecting the evidence for the thesis

### 3.1 Screenshots (take these the same day)

1. Evaluation card with the **Target met** badge, the table, and the footnote (rates + hours).
2. The **Recorded runs** list showing both runs with kWh values.
3. Live View at the moment of an automatic cutoff (lights/fan toggles OFF, room
   VACANT_CONFIRMED) — plus, ideally, a phone video of the physical lights going off.
4. cron-job.org execution history (green ticks across the experiment window).
5. Admin settings form showing the real wattages + H-1 tariff.

### 3.2 Raw data exports (Firebase console → Realtime Database → export JSON at each node)

| Evidence | RTDB path |
|---|---|
| The two runs (timestamps + meter readings) | `properties/property_001/rooms/room_001/evaluationRuns` |
| 5-min audit samples: energy, power, occupancy, **relay state per sample** | `properties/property_001/energyHistory/room_001` |
| Automatic cutoff log entries | `properties/property_001/automationLog` |
| Daily occupancy/savings aggregates | `properties/property_001/dailyAggregates/room_001` |
| Settings used | `properties/property_001/settings` |

There is no CSV export in the app — the Firebase console's JSON export is the appendix source.
Raw samples are kept ≥ 90 days by default, so nothing is deleted from under you
(`src/app/api/cron/rollup/route.ts:25-26`).

### 3.3 Next-morning artifacts

`dailyAggregates` (occupied minutes, avoided kWh) are written by the **nightly rollup at 00:05
Colombo**. To get them the same day, run it manually:

```powershell
curl.exe -H "Authorization: Bearer <CRON_SECRET>" "https://ecostay-ems.vercel.app/api/cron/rollup?date=<YYYY-MM-DD>"
```

It is idempotent — the night's scheduled run simply overwrites with the same numbers.

### 3.4 The second evidence line (occupancy-modelled §10.2)

The A/B runs are the **measured** proof. The dashboard also carries the **modelled** proof —
rated wattage × measured vacant time — on the **Activity tab → Energy Savings Validation** card,
with a CLI twin for the thesis appendix:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS='C:\path\to\service-account.json'
node scripts/validate-savings.ts --property property_001 --room room_001
```

It prints a PASS/FAIL table from real `dailyAggregates` (needs Node ≥ 23 and at least one
rolled-up day). Present both lines in the thesis: measured A/B (primary) + occupancy-modelled
(supporting), and state clearly which is which.

---

## Part 4 — Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Start buttons greyed out, "Waiting for the device to report…" | No `latest.energy` yet | Check device power/WiFi; serial heartbeat |
| Start buttons greyed out, red **offline** tag | `latest.updatedAt` older than 15 s | Device lost WiFi — check serial, router |
| "Permission denied" on Start | Rules not republished (Step 1.1) | Publish `database.rules.json` in Firebase console |
| Meter stuck at 0.000 kWh | PZEM not answering (wiring/AC side) | Check GPIO16↔TX / GPIO17↔RX crossover, CT direction, AC connections |
| Lights/fan never cut in EcoStay window | (a) cron tick paused, (b) room never reached VACANT_CONFIRMED, (c) run started while room already vacant | (a) cron-job.org history; (b) door reed wired? nothing < 50 cm before ultrasonic? (c) guest must enter *after* Start |
| Fan turns itself ON during baseline | Gas alarm (gas > 300) forces it locally | Let MQ warm up; ventilate; restart the window |
| Run shows "—" instead of kWh | End reading below start (e.g. Stop pressed while a just-rebooted node still reports 0.0) | Delete the run, keep node powered, re-run the window |
| Both Start buttons gone (only a "Stop run" panel) | A run is still open (in-progress) — it survives refresh/overnight | Press Stop; if the device is offline and Stop is disabled, delete the open run in the Firebase console under `…/evaluationRuns/<id>` |
| Meter looks online but kWh never climbs | PZEM failed mid-run; firmware re-uploads last-known-good | Check serial for `PZEM: N failed reads`; reseat GPIO16/17; re-run the window |
| Yellow warning "not a valid §10.2 pair" | Window lengths differ > 20% | Re-run so both windows are equal length |
| No "Rs saved" on the Evaluation card | Tariff category not set | Step 1.4 (set H-1) — no rollup needed; the figure renders as soon as both runs exist |
| "Not enough data yet" on the Activity-tab **Validation** card | That card (a different one) needs a rolled-up day + wattages | Step 1.4 + Step 3.3 manual rollup — the Evaluation card does not need this |
| Reduction ≈ 0% in a rehearsal with `simulate-device.ts` | The simulator ignores relays/automation by design | Expected — dry-runs rehearse the buttons only, never produce result numbers |

---

## Part 5 — Optional dry-run (no hardware)

To rehearse the button workflow before experiment day:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS='C:\path\to\service-account.json'
node scripts/simulate-device.ts
```

This feeds a fake live `latest` for room_001 every 3 s, so the Evaluation tab's buttons work.
**The numbers mean nothing** (the simulator ignores automation and repeats a fixed 120 s
occupancy loop) — use it only to practice the click sequence, then Ctrl+C. Never present
dry-run output as results (`scripts/README.md:38-39`).

**Clean up before experiment day.** Before you Ctrl+C the simulator, press **Stop** on any run
you started, then **delete every rehearsal run** from the Recorded runs list. An unstopped
rehearsal run hides both Start buttons on experiment day, and a leftover completed rehearsal run
can become the "most recent run" the card compares if you later delete a real one.

---

## Appendix — Constants the experiment depends on

| Constant | Value | Where |
|---|---|---|
| Device "online" freshness for run start/stop | 15 s | `src/telemetry/device-freshness.ts:2` |
| Telemetry upload interval | 3 s | `firmware/complete.ino:206` |
| Command poll interval | 0.5 s | `firmware/complete.ino:207` |
| Vacancy confirm after exit (door close, no motion) | 30 s | `firmware/complete.ino:563-570` |
| Vacancy confirm after door open/close with no entry | 10 s | `firmware/complete.ino:537-542` |
| Automation tick cadence | 1 min | `docs/adr/0010` |
| Automation skips silent rooms after | 90 s | `src/server/alerts.ts:12` |
| Sampler cadence / staleness cutoff | 5 min / 10 min | ADR-0010, `src/server/sample-energy.ts:5` |
| Rollup sample weight (do **not** change cron cadence without it) | 5 min | `src/server/rollup.ts:6` |
| Target reduction | 20% | `src/tariff/validation.ts:113` |
| Valid-pair duration tolerance | 20% | `src/tariff/validation.ts:61` |
| Ultrasonic presence distance | 50 cm | `firmware/complete.ino:502` |
| Gas-alarm fan override threshold | 300 | `firmware/complete.ino:425` |
