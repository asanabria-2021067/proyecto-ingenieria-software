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
    fileParallelism: false,
    testTimeout: 20000,
  },
});
