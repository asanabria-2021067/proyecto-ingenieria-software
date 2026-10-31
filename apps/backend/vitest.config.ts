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
    // RTF-3.9: un .only olvidado falla la corrida en vez de ocultar tests.
    allowOnly: false,
    clearMocks: true,
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
      // RTF-3.1: plan de subir el umbral global 5 puntos por release hasta
      // 75 (lines/functions/statements). Actual: 65. Branches se mantiene.
      thresholds: {
        lines: 65,
        functions: 65,
        branches: 80,
        statements: 65,
      },
    },
  },
});
