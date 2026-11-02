import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// SelectTrigger trae `w-fit` por defecto: en los formularios por pasos cada select debe pedir `w-full`
// (o la constante que lo incluye) para llenar su columna como el resto de campos.
const FORMULARIOS = [
  'app/dashboard/projects/mine/form/Step1.tsx',
  'app/dashboard/projects/mine/form/Step2.tsx',
  'app/dashboard/projects/mine/form/StepParticipantes.tsx',
  'components/projects/task-form-fields.tsx',
  'components/projects/task-form-extras.tsx',
  'components/projects/assign-milestone-dialog.tsx',
  'components/projects/attendance/create-activity-dialog.tsx',
  'components/organizations/org-form.tsx',
];

describe('selects de los formularios por pasos', () => {
  it.each(FORMULARIOS)('%s: todo SelectTrigger ocupa el ancho de su columna', (archivo) => {
    const fuente = readFileSync(join(__dirname, '..', archivo), 'utf8');
    const triggers = fuente.match(/<SelectTrigger\b[^>]*>/g) ?? [];
    for (const tag of triggers) {
      expect(tag, tag).toMatch(/w-full|SELECT_TRIGGER_CLASS/);
    }
  });
});
