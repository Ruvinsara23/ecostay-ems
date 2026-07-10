# Frontend Completeness Audit — EcoStay EMS

Date: 2026-07-09 · Method: 3 parallel code audits (owner UI / admin console / auth+shell+cross-cutting),
each grounded at file:line; two highest-impact bugs re-verified by hand.
Scope: everything a user actually touches. This is the "audit all" the owner asked for — not just the
four controls they spotted.

Legend: **[BUG]** broken/incorrect · **[SEC]** security/privacy · **[GAP]** missing surface ·
**[DEAD]** non-functional control · **[HALF]** half-built/duplicate · **[UX]** missing state/risky ·
**[HYG]** hygiene/consistency.

---

## A. Broken / functional bugs (fix first)

- **[BUG] Admins can't reach the dashboard.** `src/auth/require-session.tsx:26-27` redirects admin `/` → `/admin`; the admin rail's "Dashboard" link (`src/app/admin/page.tsx:58-68`) points to `/` and bounces straight back. Admin dashboard is effectively dead.
- **[BUG] Push notifications broken end-to-end.** `public/firebase-messaging-sw.js:20-21` hardcodes `messagingSenderId:"REPLACE_WITH_SENDER_ID"` / `appId:"REPLACE_WITH_APP_ID"`; lines 7-14 are unfinished AI scratch-comments; `:35` uses `/icon.png` which doesn't exist in `public/`. Background push cannot work.
- **[BUG] Foreground notifications do nothing.** `src/hooks/use-fcm.ts:75-78` — `onMessage` only `console.log`s with comment "Optionally, show a toast…". No user-visible notification.
- **[BUG] Notifications silently disappear.** `src/hooks/use-fcm.ts:18-21,31` + `src/app/page.tsx:302-304` — `isAvailable` needs appId AND senderId AND vapidKey; if any env is missing the whole bell renders `null`. Feature vanishes with no signal.
- **[BUG] Room list can hang on "loading" forever.** `src/app/page.tsx:43-45` — `listAccessibleRooms(...).then(...)` has no `.catch`; a rejected fetch never leaves the Spinner (`:51-53`). No error state.

## B. Security / privacy

- **[SEC] FCM tokens never cleared on sign-out.** `src/hooks/use-fcm.ts:52-57` writes `users/{uid}/fcmTokens/{token}` but nothing removes it on logout. On a shared device the previous user keeps receiving push.
- **[SEC] Alerts notify ALL members regardless of role.** `src/server/notifications.ts:57-60` leaves an unresolved design question inline ("Assuming anyone in members… Let's notify all users."); the described Admin/Owner role filter is not implemented.
- **[SEC/UX] Destructive actions fire with no confirmation.** Disable owner (`src/admin/admin-owners.tsx:249-257`), reset owner password (`:258-266`), reset device credential (`src/admin/admin-rooms.tsx:221-229`) all mutate live accounts on a single click.
- **[HYG] Test double ships in production module.** `FakeAdminOperations` (with `nextDevicePassword='fake-device-password'`, fake reset link) lives in the non-test file `src/admin/admin-operations.ts:78-141`.

## C. Missing management surfaces — the admin console is write-only

The `AdminOperations` port (`src/admin/admin-operations.ts:11-19`) has 7 methods; only **one** reads (`listOwners`).

- **[GAP] No property list.** No `listProperties`; no Properties view (`src/app/admin/page.tsx:11` = settings|rooms|owners). Property names exist at `properties/{pid}/name` (`src/server/admin-deps.ts:173-175`) but are never listed.
- **[GAP] No room list.** `admin-rooms.tsx` is a register form only. All rooms are enumerable server-side via `ops/roomIndex` (`src/server/admin-deps.ts:14-28`) but nothing surfaces them.
- **[GAP] No device list or status.** No `listDevices`; device accounts (role:device in Auth, `src/server/manage-device.ts:47-49`) can be created/reset but never listed. Admin never reads `latest.updatedAt`, so no device online/last-seen anywhere.
- **[GAP] No property → owners.** Owners view shows owner→properties only (`src/admin/admin-owners.tsx:227-234`); the authority record `properties/{pid}/members/{uid}` (`src/server/admin-owners.ts:58`) is never read back. Can't answer "who owns property X".
- **[GAP] No delete / rename / unassign.** No delete room, no rename property/room (only re-run register with same slugs), no add/remove owner property assignment, no delete owner (disable only), no disable/delete device account.

## D. Dead / placeholder controls

- **[DEAD] "Add Device" button** — no handler, brand-primary CTA, most visible control on the owner dashboard. `src/app/page.tsx:281-283`.
- **[DEAD] Edit pencil** next to the room title — no handler. `src/app/page.tsx:271-275`.
- **[DEAD] "Notifications enabled" pill** rendered as a `<button>` with no onClick; no way to revoke. `src/app/page.tsx:306-317`.
- **[DEAD] Owner "Settings" rail icon** — greyed, fires "Settings is coming soon" toast. `src/app/page.tsx:189,245-249`.
- **[DEAD] No admin sign-out** anywhere in the admin console. `src/app/admin/page.tsx:51-84`.
- **[DEAD] No forgot-password / self-service reset on login** — owners locked out have no path (reset is admin-only). By design per copy (`src/app/login/page.tsx:206-208`) but a real product gap.

## E. Half-built / duplicate views

- **[HALF] "Home" and "Live View" render the same screen.** `src/app/page.tsx:190` (`roomTab = activeTab==='Home' ? 'Live View' : activeTab`). Two nav items, one view.
- **[HALF] "Devices" tab just re-renders `<DeviceControls>`** already shown in Live View. `src/rooms/room-devices-view.tsx:80-84` vs `src/rooms/room-live-view.tsx:311`. No device inventory.
- **[HALF] "Activity" tab** duplicates Live View's activity group and then shows "…history will appear here in future updates." `src/rooms/room-activity-view.tsx:70-131`.
- **[HALF] "Routines" tab** — one hardcoded Vacancy-Cutoff card + "Time-of-Use and Scheduled Automations — Coming soon." `src/rooms/room-routines-view.tsx:81-88`. No create/edit/delete routines.
- **[HALF] Static header title.** "Live 3D Room View" never changes across Devices/Routines/Activity tabs. `src/app/page.tsx:268-270`.
- **[HALF] "Light level" hardcoded "No sensor".** `src/rooms/room-live-view.tsx:293`.

## F. Missing states & risky UX

- **[UX] Owner-load errors swallowed to `[]`** → renders "No owner accounts yet", masking a fetch failure. `src/admin/admin-owners.tsx:60-62,205-206`.
- **[UX] Blind free-text ID entry everywhere in admin.** Room register (`src/admin/admin-rooms.tsx:140-157`), device fields (`:198-209`), owner property (`src/admin/admin-owners.tsx:168-173`). A typo silently creates a NEW property instead of erroring (`src/server/register-room.ts:29-34`).
- **[UX] Generated credentials shown once, no copy button, cleared on any field edit.** `src/admin/admin-rooms.tsx:237-244,61-68`; owner reset link similar (`src/admin/admin-owners.tsx:237-246`).
- **[UX] Settings hides the property picker when only one property** (`src/admin/admin-settings.tsx:187`), and a property with **zero rooms is invisible** to Settings (list derived by deduping rooms, `:100-107`).
- **[UX] Rooms/Devices views have no loading/empty states** (they read nothing).

## G. Code hygiene & consistency

- **[HYG] Duplicated rails** — admin `RailButton` (`src/app/admin/page.tsx:13-43`) vs owner `RailIcon` (`src/app/page.tsx`), independent.
- **[HYG] Duplicated form primitives** — `TextField` redeclared in `admin-rooms.tsx:12-35` and `admin-owners.tsx:11-36`; `NumberField` a third variant in `admin-settings.tsx:51-77`; `fieldClass` string copy-pasted in all three.
- **[HYG] Split property-discovery seams** — `admin-settings` uses `RoomDataSource.listAccessibleRooms`; `admin-rooms/owners` use `AdminOperations`. Two ports, neither lists properties first-class.
- **[HYG] Stray console.logs in prod** — `src/hooks/use-fcm.ts:76`, `src/server/notifications.ts:88`, `firebase-messaging-sw.js:30`.
- **[HYG] Config drift** — SW hardcodes Firebase config (`firebase-messaging-sw.js:15-22`) while the app reads `NEXT_PUBLIC_*` (`src/firebase/app.ts:10-16`).
- **[HYG] Dead import** `OCCUPANCY_STATES` in `src/rooms/room-activity-view.tsx:7`.
- **[HYG] No tests** for `src/hooks/use-fcm.ts` or `src/server/notifications.ts` (both production features).
- **[HYG] Magic number** gas threshold `300` hardcoded in `src/rooms/room-scene.tsx:44,82` while others import `GAS_ALARM_THRESHOLD`.

## H. Working as intended — NOT defects (so we don't "fix" them)

- Energy/power "Simulated" labels (`room-live-view.tsx:299`, `energy-charts.tsx:227`) — correct per ADR-0003 until real PZEM (firmware slice 05).
- Login has no sign-up (accounts are admin-created — by design); it *does* have proper error + loading states.
- `src/ui/toggle.tsx`, room picker, switch-room, acknowledge, sensor markers, sign-out avatar, device/automation toggles — all genuinely functional.

---

## Suggested response

This is bigger than "admin console v2" — it's **frontend completion**. Recommended order:
1. **Bugs (A)** — admin↔dashboard routing, and decide FCM: finish it or remove it (don't ship broken).
2. **Dead controls (D)** — logout + remove/hide every no-op (fast, high visible payoff).
3. **Admin management surfaces (C)** — the property/room/device/owner browse layer (the `.scratch/admin-console-v2/PRD.md` plan).
4. **Half-built tabs (E)** — build out or collapse Devices/Routines/Activity honestly.
5. **UX + hygiene (B/F/G)** — confirmations, states, shared components, prune console.logs/dead code.

## Coverage map (updated 2026-07-09) — where every finding is handled

The admin-console-v2 plan does NOT cover everything here. This map is the honest ledger;
a finding without a home below is a tracking bug in this document.

| Audit item | Where it's handled | Status |
|---|---|---|
| A1 admin↔dashboard routing | v2 slice 01 (chassis; risk-gated stop) | planned |
| A2-A4 FCM broken (SW placeholders, no foreground UI, silent vanish) | **OWNER DECISION: finish vs remove** — then its own slice, not in v2 | ⚠ undecided |
| A5 room-list endless spinner | v2 slice 00 | **done (this session)** |
| B1 FCM tokens persist after sign-out | rides with the FCM decision | ⚠ undecided |
| B2 alerts notify all members | server-side fix, own mini-slice (notifications.ts) | unplanned — needs slice |
| B3 no confirmations on destructive actions | v2 slices 01 (ConfirmDialog) + 05/06 (apply) | planned |
| B4 FakeAdminOperations in prod module | v2 slice 01 | planned |
| C1-C5 write-only admin (no property/room/device lists, no members read-back, no delete/rename) | v2 slices 02-07 | **read layer done 2026-07-09** (Properties list default view, property detail with rooms + device account + last-seen; GET /api/admin/properties + /rooms; screenshot-verified). Members read-back, edit/delete, inline forms still pending (slices 05-07) |
| D1 Add Device dead button | v2 slice 00 | **done** |
| D2 edit pencil dead | v2 slice 00 | **done** |
| D3 notification pill inert button | v2 slice 00 (now a status badge) | **done** |
| D4 owner Settings "coming soon" | v2 slice 00 (removed for owners) | **done** |
| D5 no admin sign-out | v2 slice 00 | **done** |
| D6 no forgot-password on login | **OWNER DECISION** (self-service vs admin-only is a product call) | ⚠ undecided |
| E1-E5 half-built owner tabs (Home==Live, thin Devices/Activity, Routines placeholder, static title) | **separate owner-side workstream** — needs its own PRD; NOT in v2 | unplanned — needs PRD |
| F1-F5 UX gaps (swallowed errors, blind IDs, one-shot credentials, hidden picker) | v2 slices 03/05/07 | planned |
| G hygiene (dup components, console.logs, config drift, dead import, magic 300, untested fcm/notifications) | v2 slices 01/08 + FCM decision | planned/partial |
