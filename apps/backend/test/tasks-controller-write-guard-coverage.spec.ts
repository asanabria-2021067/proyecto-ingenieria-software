import { describe, expect, it } from 'vitest';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { TasksController } from '../src/tasks/tasks.controller';
import { ProjectWriteGuard } from '../src/common/guards/project-write.guard';
import {
  PROJECT_WRITE_METADATA_KEY,
  type ProjectWriteMetadata,
} from '../src/common/guards/project-write.metadata';

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

  // C028: la cobertura se expresa también como metadata declarada (@ProjectWrite).
  it.each(WRITE_HANDLERS)('%s (WRITE) declara metadata @ProjectWrite con P/E y Sprint ACTIVO', (handlerName) => {
    const handler = (TasksController.prototype as unknown as Record<string, object>)[handlerName];
    const metadata = Reflect.getMetadata(PROJECT_WRITE_METADATA_KEY, handler) as ProjectWriteMetadata | undefined;
    expect(metadata).toBeDefined();
    expect(metadata?.source).toEqual({ kind: 'param', name: 'projectId' });
    expect([...(metadata?.states ?? [])]).toEqual(['P', 'E']);
    expect(metadata?.sprint).toBe('ACTIVO');
  });

  it.each(READ_HANDLERS)('%s (READ) NO declara metadata @ProjectWrite', (handlerName) => {
    const handler = (TasksController.prototype as unknown as Record<string, object>)[handlerName];
    expect(Reflect.getMetadata(PROJECT_WRITE_METADATA_KEY, handler)).toBeUndefined();
  });
});
