import { defineConfig, devices } from '@playwright/test';

/**
 * G07-C12 (T14): tramo de navegador del arnés efímero de topología
 * (infra/staging). Corre contra el nginx del arnés con TLS autofirmado; nunca
 * contra producción (el spec rechaza hosts no locales). No levanta servidores:
 * lo invoca infra/staging/run-harness.sh con HARNESS_BROWSER=1 y el arnés ya
 * arriba. La suite E2E normal (playwright.config.ts, ./e2e) no lo incluye.
 */
export default defineConfig({
  testDir: './e2e-harness',
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.HARNESS_BASE_URL,
    ignoreHTTPSErrors: true,
    trace: 'off',
    screenshot: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
