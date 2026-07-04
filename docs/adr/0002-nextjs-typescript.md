# ADR-0002: Next.js (App Router) + TypeScript for the dashboard

Date: 2026-07-04 · Status: Accepted

## Context
The dashboard needs auth-gated pages, a realtime view over Firebase RTDB, and a place to
later host server-side logic (e.g. scheduled history recording, tariff endpoints) without
introducing a separate backend. The team already knows React.

## Decision
Next.js with the App Router, TypeScript in `strict` mode, `src/` layout.
The realtime dashboard itself is client-rendered (RTDB listeners are client SDK);
Next's server side stays available for auth pages, API routes, and future server logic —
it is not used speculatively.

## Consequences
- One deployable unit; no phantom second backend (the old build's `localhost:5000/api` mistake).
- TypeScript types encode the firmware contract — field-name drift becomes a compile error.
- If server-side RTDB access is ever needed (rules-privileged writes), it goes through a
  Next API route using the Firebase Admin SDK — a new ADR at that point.
