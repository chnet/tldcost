import { defineConfig, devices } from '@playwright/test';

// Two static servers: A = fixture build with operator flag, B = same data without it.
// Build them first: `node tests/e2e/build-fixtures.mjs` (npm run test:e2e does both).
// Ports 4401/4402, or E2E_PORT_A/E2E_PORT_B for a second run at the same time. A server already
// listening on a port is never reused: a parallel run fails fast instead of testing the other
// run's build.
function port(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) {
    throw new Error(`${name} must be a port number 1024..65535, got "${value}"`);
  }
  return n;
}
export const PORT_A = port('E2E_PORT_A', 4401);
export const PORT_B = port('E2E_PORT_B', 4402);
if (PORT_A === PORT_B) throw new Error(`E2E_PORT_A and E2E_PORT_B must differ (${PORT_A})`);
const server = (variant: string, port: number) => ({
  command: `node tests/e2e/static-server.mjs dist-e2e/${variant} ${port}`,
  url: `http://127.0.0.1:${port}/__health`,
  reuseExistingServer: false,
});

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT_A}`,
    // local runs may use the installed Chrome (PW_CHANNEL=chrome); CI installs Chromium
    ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [server('a', PORT_A), server('b', PORT_B)],
});
