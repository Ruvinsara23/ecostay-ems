import { describe, expect, it, vi } from 'vitest';
import {
  assertLocalAutomationUrl,
  requestLocalAutomationTick,
} from './local-automation-client.mts';

describe('assertLocalAutomationUrl', () => {
  it.each([
    'http://localhost:3000/api/cron/tick',
    'http://127.0.0.1:3000/api/cron/tick',
    'http://[::1]:3000/api/cron/tick',
  ])('accepts a loopback URL: %s', (url) => {
    expect(assertLocalAutomationUrl(url).href).toBe(url);
  });

  it('rejects a remote host so the dev runner cannot target production', () => {
    expect(() =>
      assertLocalAutomationUrl('https://ecostay-ems.vercel.app/api/cron/tick'),
    ).toThrow('loopback');
  });
});

describe('requestLocalAutomationTick', () => {
  it('sends the cron bearer token without returning or logging it', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ automation: { restored: 1 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await requestLocalAutomationTick({
      secret: 'do-not-leak',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:3000/api/cron/tick',
      expect.objectContaining({
        headers: { Authorization: 'Bearer do-not-leak' },
      }),
    );
    expect(JSON.stringify(result)).not.toContain('do-not-leak');
    expect(result.status).toBe(200);
  });

  it('fails closed when CRON_SECRET is missing', async () => {
    await expect(
      requestLocalAutomationTick({
        secret: '',
        fetchImpl: vi.fn(),
      }),
    ).rejects.toThrow('CRON_SECRET');
  });

  it('reports an unsuccessful tick without exposing the secret', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('unauthorized', { status: 401 }));

    await expect(
      requestLocalAutomationTick({
        secret: 'hidden-value',
        fetchImpl,
      }),
    ).rejects.toThrow('401');
  });
});
