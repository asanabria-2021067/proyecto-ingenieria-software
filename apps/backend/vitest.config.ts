import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    exclude: [
      '**/node_modules/**',
      'test/roles-participation.integration.spec.ts',
      'test/integration/**',
      'test/password-recovery-admin.real-db.e2e.spec.ts',
    ],
    globals: true,
    clearMocks: true,
    // IESUC-568 (RTF 3.9): un .only olvidado hace fallar la corrida.
    allowOnly: false,
    // G01 · OWASP25-C019: JWT_SECRET sintético para todas las suites.
    setupFiles: ['test/helpers/synthetic-jwt-secret.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'test/**',
        '**/*.spec.ts',
        '**/*.dto.ts',
        '**/*.module.ts',
        'src/main.ts',
        'src/scripts/**',
        'prisma/**',
      ],
      // El Sprint 7 trajo un volumen grande de código nuevo (project-closure,
      // leadership, task-hour-adjustments, etc.) más rápido de lo que su
      // cobertura de tests creció; el umbral global quedó por encima de la
      // cobertura real (62.01% lines / 61.12% functions / 62.01% statements
      // medido en CI) y bloqueaba cualquier PR sin que ningún test fallara.
      // Bajado para reflejar la realidad actual, con margen; branches ya
      // pasaba, se deja igual.
      //
      // IESUC-568 (RTF 2 · 3.1): con las pruebas de project-closure-review y
      // task-hour-adjustments la cobertura medida en CI quedó en 75.69% lines /
      // 72.96% functions / 90.20% branches / 75.69% statements; el umbral es el
      // entero inmediatamente inferior. Plan de subida gradual: +2 puntos por
      // sprint en lines/functions/statements (priorizando los servicios con
      // menos cobertura) hasta 80%, sin bajar nunca un umbral ya alcanzado.
      thresholds: {
        lines: 75,
        functions: 72,
        branches: 90,
        statements: 75,
      },
    },
  },
});
