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
    // jsdom acumula memoria entre archivos dentro del mismo worker (~105
    // archivos de test). tinypool reparte archivos entre forks de forma
    // dinámica, no pareja: maxForks:4 + 3072MB cada uno reventó con
    // "JavaScript heap out of memory" (un fork se quedó con la cola larga).
    // maxForks:1 evita el reparto desigual pero, verificado en CI real,
    // termina colgado indefinidamente tras acabar los tests (handle
    // filtrado sin cerrar en algún archivo, síntoma conocido de
    // jsdom+vitest) en vez de reventar rápido. maxForks:2 con techo alto
    // (6144MB c/u = 12GB, deja ~4GB en un runner de 16GB) reduce el riesgo
    // de reparto desigual sin caer en la ejecución 100% serial que colgó.
    // NODE_OPTIONS no llega de forma confiable a los workers de tinypool,
    // así que el límite se pasa directo como flag de proceso via execArgv.
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 2,
        execArgv: ['--max-old-space-size=6144'],
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
