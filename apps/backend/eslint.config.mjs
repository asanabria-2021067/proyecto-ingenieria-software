import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // TypeScript rules
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // General rules
      'no-console': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',

      // RTF-3.3: archivos nuevos no pueden pasar de 800 lineas.
      'max-lines': ['error', { max: 800 }],
    },
  },
  {
    // RTF-3.3: archivos que ya pasaban de 800 lineas al introducir la regla.
    // Warn hasta terminar la division por caso de uso
    // (docs/architecture/plan-division-servicios.md); no agregar archivos nuevos aqui.
    files: [
      'src/tasks/tasks.service.ts',
      'src/sprints/sprints.service.ts',
      'src/projects/projects.service.ts',
      'src/chat/chat.service.ts',
      'src/admin/admin.service.ts',
      'src/time-records/time-records.service.ts',
      'src/events/admin-meetings.service.ts',
      'src/comentarios/comentarios.service.ts',
      'src/leadership/leadership.service.ts',
      // PERMANENTE: los specs y fixtures de test/ siempre quedan en warn (un caso
      // por it); este tramo no se retira al terminar la division de servicios.
      'test/**/*.ts',
    ],
    rules: {
      'max-lines': ['warn', { max: 800 }],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', '*.js', '*.mjs'],
  },
];
