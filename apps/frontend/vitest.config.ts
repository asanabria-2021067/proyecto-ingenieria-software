import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * T-123: umbral piso (10%) hasta medir el numero real en CI (la medicion
 * local de la suite completa no se pudo completar en Windows).
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
