import { requestLocalAutomationTick } from '../src/server/local-automation-client.mts';

const watch = process.argv.includes('--watch');
const url =
  process.env.LOCAL_AUTOMATION_URL ??
  'http://localhost:3000/api/cron/tick';
const intervalMs = 5_000;
let stopping = false;

process.once('SIGINT', () => {
  stopping = true;
});
process.once('SIGTERM', () => {
  stopping = true;
});

async function tick() {
  const result = await requestLocalAutomationTick({
    secret: process.env.CRON_SECRET,
    url,
  });
  const automation =
    result.body && typeof result.body === 'object' && 'automation' in result.body
      ? result.body.automation
      : result.body;
  console.log(
    `[local-automation] ${new Date().toISOString()} HTTP ${result.status}`,
    automation,
  );
}

try {
  do {
    await tick();
    if (!watch || stopping) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  } while (!stopping);
} catch (error) {
  console.error(
    '[local-automation]',
    error instanceof Error ? error.message : 'Unknown error',
  );
  process.exitCode = 1;
}
