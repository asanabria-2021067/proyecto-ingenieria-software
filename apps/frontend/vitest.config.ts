import path from 'node:path';
import { defineConfig } from 'vitest/config';

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
    // jsdom acumula memoria entre archivos dentro del mismo worker (~70
    // archivos de test) y agota el heap por defecto de V8 (~4GB) en el
    // runner de CI, con o sin cobertura. NODE_OPTIONS no llega de forma
    // confiable a los workers de tinypool, así que el límite se pasa
    // directo como flag de proceso via execArgv.
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 2,
        execArgv: ['--max-old-space-size=8192'],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      exclude: [
        'test/**',
        'e2e/**',
        '**/*.spec.ts',
        '**/*.spec.tsx',
        '**/*.config.ts',
        'app/**/layout.tsx',
        '.next/**',
      ],
      thresholds: {
        lines: 30,
        functions: 60,
        branches: 60,
        statements: 30,
      },
    },
  },
});
