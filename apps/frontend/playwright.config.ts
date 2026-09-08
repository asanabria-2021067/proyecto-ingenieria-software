import { defineConfig, devices } from '@playwright/test';

// Suite de humo (T-125): solo 3 flujos críticos, un navegador. La cobertura
// multi-browser/rendimiento/carga queda para sprints posteriores.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // En CI todos los specs comparten un único backend/frontend de dev (ver
  // webServer abajo): con más de un worker, tests pesados (dos contextos de
  // navegador, sockets, drag real) compiten por el mismo servidor y unos a
  // otros se hacen perder su propia ventana de tiempo (visto en CI real:
  // login colgado más allá de 30s solo bajo esa contención). Serializar en
  // CI cambia velocidad por estabilidad; en local, con --workers no seteado,
  // sigue paralelo.
  workers: process.env.CI ? 1 : undefined,
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
