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
