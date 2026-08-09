import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * T-123: mismo criterio que apps/backend/vitest.config.ts — umbral piso
 * (10%) hasta medir el número real localmente con `npm run test:coverage`.
 * No se generó esa medición real en este entorno por falta de acceso a
 * red/base de datos para correr la suite completa.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.spec.ts', 'test/**/*.spec.tsx'],
    globals: true,
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      exclude: [
        'test/**',
        '**/*.spec.ts',
        '**/*.spec.tsx',
        '.next/**',
        'components/ui/**',
      ],
      thresholds: {
        lines: 10,
        functions: 10,
        branches: 10,
        statements: 10,
      },
    },
  },
});
