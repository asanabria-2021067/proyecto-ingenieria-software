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
    },
  },
  {
    // IESUC-568 (RTF 2 · 3.3): sprints, projects y tasks pasan de 1,500 líneas.
    // Dividirlos queda para después de la entrega; mientras, esta advertencia
    // evita que cualquier servicio siga creciendo sin que se note.
    files: ['**/*.service.ts'],
    rules: {
      'max-lines': ['warn', { max: 500 }],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', '*.js', '*.mjs'],
  },
];
