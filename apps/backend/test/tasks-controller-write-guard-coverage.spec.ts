import { describe, expect, it } from 'vitest';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { TasksController } from '../src/tasks/tasks.controller';
import { ProjectWriteGuard } from '../src/common/guards/project-write.guard';

/**
 * A3: demuestra, vía metadata real de Nest (no por convención de nombres),
 * que exactamente los handlers mutantes de TasksController llevan
 * ProjectWriteGuard y que las lecturas quedan intactas — la superficie
 * completa del controller en el momento de escribir A3, incluyendo la ruta
 * concurrente closeAssignment ya presente en el archivo.
 */
const READ_HANDLERS = ['findAll', 'findOne'] as const;
const WRITE_HANDLERS = [
  'create',
  'update',
  'updateEstado',
  'remove',
  'assign',
  'unassign',
  'closeAssignment',
] as const;

function guardsOf(handlerName: string): unknown[] {
  const handler = (TasksController.prototype as unknown as Record<string, object>)[handlerName];
  return Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
}

describe('TasksController — cobertura de ProjectWriteGuard (SYNC GATE 2)', () => {
  it('el controller expone exactamente los handlers inventariados (ni más ni menos)', () => {
    const propertyNames = Object.getOwnPropertyNames(TasksController.prototype).filter(
      (name) => name !== 'constructor',
    );
    expect(propertyNames.sort()).toEqual([...READ_HANDLERS, ...WRITE_HANDLERS].sort());
  });

  it.each(WRITE_HANDLERS)('%s (WRITE) tiene ProjectWriteGuard aplicado', (handlerName) => {
    expect(guardsOf(handlerName)).toContain(ProjectWriteGuard);
  });

  it.each(READ_HANDLERS)('%s (READ) NO tiene ProjectWriteGuard aplicado', (handlerName) => {
    expect(guardsOf(handlerName)).not.toContain(ProjectWriteGuard);
  });
});
