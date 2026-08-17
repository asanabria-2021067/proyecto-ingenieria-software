import { defineConfig } from 'vitest/config';

/**
 * T-123: cobertura con umbral minimo y reporte publicable. Medido
 * localmente: 71.52% lineas, 87.44% ramas, 71.78% funciones, 71.52%
 * statements (1225 tests, 0 fallidos). Umbral debajo de lo medido para no
 * romper el pipeline con variaciones normales.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    globals: true,
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      exclude: [
        'test/**',
        '**/*.spec.ts',
        '**/*.dto.ts',
        '**/*.module.ts',
        'src/main.ts',
        'prisma/**',
      ],
      thresholds: {
        lines: 65,
        functions: 65,
        branches: 80,
        statements: 65,
      },
    },
  },
});
