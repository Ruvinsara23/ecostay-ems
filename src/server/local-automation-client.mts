const DEFAULT_LOCAL_TICK_URL = 'http://localhost:3000/api/cron/tick';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export type LocalAutomationTickResult = {
  status: number;
  body: unknown;
};

export function assertLocalAutomationUrl(
  value = DEFAULT_LOCAL_TICK_URL,
): URL {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(
      'The local automation runner only accepts an HTTP loopback URL.',
    );
  }
  return url;
}

export async function requestLocalAutomationTick({
  secret,
  url = DEFAULT_LOCAL_TICK_URL,
  fetchImpl = fetch,
}: {
  secret: string | undefined;
  url?: string;
  fetchImpl?: typeof fetch;
}): Promise<LocalAutomationTickResult> {
  if (!secret) {
    throw new Error('CRON_SECRET is required for the local automation runner.');
  }

  const tickUrl = assertLocalAutomationUrl(url);
  const response = await fetchImpl(tickUrl.href, {
    method: 'GET',
    headers: { Authorization: `Bearer ${secret}` },
    cache: 'no-store',
  });

  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(`Local automation tick failed with HTTP ${response.status}.`);
  }

  return { status: response.status, body };
}
