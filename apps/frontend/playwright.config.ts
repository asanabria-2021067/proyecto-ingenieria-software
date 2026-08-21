import { defineConfig, devices } from '@playwright/test';

// Suite de humo (T-125): solo 3 flujos críticos, un navegador. La cobertura
// multi-browser/rendimiento/carga queda para sprints posteriores.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Si ya tienes `npm run dev` corriendo en el baseURL, Playwright lo
  // reutiliza en vez de levantar uno nuevo. El backend + base de datos
  // deben estar arriba aparte (docker-compose.dev.yml).
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
