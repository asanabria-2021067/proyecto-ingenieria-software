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
    // archivos de test), asi que cuantos menos archivos le toquen a cada
    // fork antes de que termine la corrida, menos acumula. maxForks:2 con
    // un techo de 8192MB cada uno pedia hasta 16GB en un runner de GitHub
    // Actions (ubuntu-latest: 4 vCPU / 16GB) sin dejar margen para el SO,
    // el proceso orquestador ni la memoria nativa de jsdom (fuera del heap
    // de V8) — reventaba con "JavaScript heap out of memory" igual, ya
    // verificado en CI real. Con el doble de forks cada uno procesa la
    // mitad de archivos (menos acumulación por proceso) y un techo menor
    // dejan ~4GB de margen real. NODE_OPTIONS no llega de forma confiable a
    // los workers de tinypool, así que el límite se pasa directo como flag
    // de proceso via execArgv.
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 4,
        execArgv: ['--max-old-space-size=3072'],
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
