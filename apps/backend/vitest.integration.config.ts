import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'test/roles-participation.integration.spec.ts',
      'test/integration/**/*.integration.spec.ts',
      'test/password-recovery-admin.real-db.e2e.spec.ts',
    ],
    globals: true,
    clearMocks: true,
    // G01 · OWASP25-C019: JWT_SECRET sintético para todas las suites.
    setupFiles: ['test/helpers/synthetic-jwt-secret.setup.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
});
