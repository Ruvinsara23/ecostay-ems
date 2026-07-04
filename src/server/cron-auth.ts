/**
 * Guard for the cron endpoints (ADR-0010). A request is authorized only when a
 * non-empty CRON_SECRET is configured AND the Authorization header carries
 * exactly `Bearer ${CRON_SECRET}`. An unconfigured secret rejects everything —
 * fail closed, never open.
 */
export function isCronAuthorized(
  authorizationHeader: string | null,
  configuredSecret: string | undefined,
): boolean {
  if (!configuredSecret) return false;
  return authorizationHeader === `Bearer ${configuredSecret}`;
}
