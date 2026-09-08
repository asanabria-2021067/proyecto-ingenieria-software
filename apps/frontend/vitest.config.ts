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
    // dinámica, no pareja: en corridas reales (locales y en CI) un solo
    // fork terminó procesando la cola larga de archivos mientras los demás
    // quedaban ociosos, y ese fork reventó con "JavaScript heap out of
    // memory" incluso con maxForks:4 + 3072MB cada uno (12GB repartidos,
    // pero mal repartidos). Un solo fork secuencial con techo generoso es
    // más lento pero predecible: toda la acumulación vive en un único
    // proceso, nunca depende de a cuál fork le tocó la mala suerte del
    // reparto. 10240MB deja margen real en un runner de GitHub Actions
    // (ubuntu-latest: 4 vCPU / 16GB) para el SO y el proceso orquestador.
    // NODE_OPTIONS no llega de forma confiable a los workers de tinypool,
    // así que el límite se pasa directo como flag de proceso via execArgv.
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 1,
        execArgv: ['--max-old-space-size=10240'],
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
