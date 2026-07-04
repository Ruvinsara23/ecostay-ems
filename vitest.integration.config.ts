import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Integration tests talk to the Firebase Emulator Suite — run via `npm run test:integration`,
// which boots the emulator around this config. Kept out of the default `npm test` loop.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.integration.test.{ts,tsx}'],
    testTimeout: 15000,
    hookTimeout: 15000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
