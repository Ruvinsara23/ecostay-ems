# 01 — Owner authentication + project bootstrap

Status: ready-for-human (implemented 2026-07-04 — awaiting human review; human owns the merge)
Slice: 1 of 4
Covers user stories: 1–8 (and seeds the data behind 9–13)

## Parent

`.scratch/owner-live-room-view/PRD.md` — Owner live room view (walking skeleton).

## What to build

The authentication tracer bullet, plus the shared foundation every later slice needs. A signed-in
Owner can reach the dashboard; everyone else is bounced to a login page.

End-to-end behavior:

- An Owner signs in with email and password and lands on a minimal authenticated landing that proves
  the session (e.g. "Signed in as {email}" with a Sign out control). The placeholder content is
  replaced by real telemetry in Slice 2.
- Sign-out returns to the login page.
- Any dashboard route opened while signed out redirects to login, preserving the intended path so the
  Owner is returned there after signing in.
- Visiting the login page while already signed in redirects to the dashboard.
- A Firebase **anonymous** session (the device auth mechanism) resolves to **no dashboard session** —
  a device credential can never load the human UI.
- Wrong credentials produce a clear, human-readable error.
- The session survives a page reload.

Foundation folded into this slice (none of it is independently demoable, so it ships with the first
feature that needs it):

- **Firebase app init** — a single client-SDK app singleton reading `NEXT_PUBLIC_FIREBASE_*` from the
  environment (`.env.example` already lists the keys). The dashboard connects to the same Firebase
  project the firmware writes to (`esp32led-b6105-c0b99`, asia-southeast1).
- **`AuthGateway` port** — the auth seam described in the PRD: `signIn(email, password)`,
  `signOut()`, `observeSession(cb)` yielding a `Session | null` carrying `uid` and the `role`
  (`"owner" | "admin" | "device"`) resolved from the Firebase custom-claims token. A real adapter
  wraps `firebase/auth`; an in-memory fake implements the same interface for UI tests. The port is
  provided to the React tree via context so tests can inject the fake.
- **Firebase Emulator (Auth) test harness** — an integration test path (separate from the default
  pure-unit `npm test`) that runs the real adapter against the Auth emulator.
- **Seed script** — a human-run Admin-SDK script that bootstraps the dev/demo data: one Owner
  account with a `role: owner` custom claim, the `property_001` Property and `room_001` Room records,
  and the `properties/property_001/members/{uid}` + `users/{uid}/properties/property_001` tenancy
  records the later slices read. Documented as a dev/bootstrap tool, not product code.

Respects ADR-0002 (client-rendered realtime, TS types), ADR-0003 (RTDB + public web config; security
lives in rules), and ADR-0005 (roles via custom claims). **Risk gate:** this slice touches auth —
confirm the guard/claims behavior with a human before finalizing. It does **not** author RTDB
security rules (that is a later, separately gated slice); the seed script runs with Admin-SDK
privileges out-of-band.

## Acceptance criteria

- [ ] An Owner signs in with valid email/password and reaches the authenticated landing showing their identity and a working Sign out.
- [ ] Wrong credentials show a clear error and do not sign the user in.
- [ ] The session persists across a full page reload (no re-login).
- [ ] Opening a dashboard route while signed out redirects to login and, after signing in, returns the user to the originally requested path.
- [ ] Visiting the login page while signed in redirects to the dashboard.
- [ ] An anonymous Firebase session is treated as no dashboard session (cannot load the dashboard).
- [ ] `AuthGateway` has an in-memory fake used by UI tests and a real `firebase/auth` adapter; the UI imports the port, never the SDK directly.
- [ ] An emulator-backed integration test proves the real adapter signs a seeded user in and out and surfaces the `role` claim; the default `npm test` stays emulator-free and green.
- [ ] The seed script creates the Owner (with role claim), `property_001`/`room_001`, and the membership + user-property index records, and is documented as a dev tool.
- [ ] `npm test` and `npm run typecheck` are green.

## Blocked by

None — can start immediately.

## Comments

**2026-07-04 (agent) — implemented via TDD, all acceptance criteria green.**

- 8 red→green cycles. Verification: **31 unit tests** (fake-backed, emulator-free) + **10 emulator
  integration tests** (same shared contract suite against the real `firebase/auth` adapter, plus the
  anonymous-device case) + `typecheck`, `lint`, and `next build` all green.
- Seams as agreed: `AuthGateway` port (`src/auth/`), fake + Firebase adapter kept honest by one
  shared contract suite; UI never imports the Firebase SDK. `RequireSession` guard also rejects a
  `device`-role session (defense in depth). Login `next` param is open-redirect-guarded.
- Risk gate (auth) was approved by the human before implementation (custom-claims contract:
  owner/admin only; anonymous + unclaimed → no session, 'not provisioned' error).
- Seed script: `npm run seed` (`scripts/seed.ts`, docs in `scripts/README.md`). Supports real
  project (service account) and emulators; sets role claims; writes membership + user-index +
  name records (names only when absent).
- **Remaining for the human**: (1) run the seeder against the real project with a service-account
  key to create the first owner/admin; (2) one manual end-to-end pass in the browser (`npm run dev`,
  sign in, reload to confirm SDK session persistence live); (3) review + commit — nothing committed.

**2026-07-04 (agent) — seeded the real project (esp32led-b6105-c0b99).**

- Owner `user@gmail.com` (uid `FNTXufvQKaYcaJ189SEQ6s7XaZo2`) with role claim, linked to
  `property_001`/`room_001`; admin `admin@gmail.com` (uid `cvSjeeVB8HRQxRdTVlptOKzDaVI3`), no
  tenancy records (admins bypass membership). Read-back verified: property/room names, members
  map, and owner index all present. Dev passwords are with the human (rotate before any real
  deployment). Remaining: live browser pass + review/commit.

**2026-07-04 (agent) — re-seeded after the ADR-0009 project migration.**

- System moved to the fresh `ecostay-ems` project (see ADR-0009); `.env.local` retargeted by the
  human; transitional rules published from `database.rules.json`. Owner uid
  `iRxdSTeMruVJCFhlsoWNO9LqhyW2`, admin uid `h25XNMGgkLeMdz79GZClXM8uBh33`; tenancy read-back
  verified in the new RTDB. Same credentials as before. The old-project seeding is void.
- Live telemetry (slice 02) blocked on the human reflashing the ESP32 with the new
  `API_KEY`/`DATABASE_URL` (firmware/complete.ino lines 16–17).
