import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BulkTaskActionDto, MAX_TAREAS_ACCION_MASIVA } from '../src/tasks/dto/bulk-task-action.dto';

async function errores(valor: Record<string, unknown>) {
  const errs = await validate(plainToInstance(BulkTaskActionDto, valor));
  return errs.map((e) => e.property);
}

describe('BulkTaskActionDto (HU-202/T-383)', () => {
  it('acepta MOVER con estadoTarea válido', async () => {
    expect(await errores({ idsTareas: [1, 2], accion: 'MOVER', estadoTarea: 'HECHO' })).toEqual([]);
  });

  it('acepta ASIGNAR con idUsuario y DESASIGNAR sin campos extra', async () => {
    expect(await errores({ idsTareas: [1], accion: 'ASIGNAR', idUsuario: 7 })).toEqual([]);
    expect(await errores({ idsTareas: [1], accion: 'DESASIGNAR' })).toEqual([]);
  });

  it('acepta AGREGAR_ETIQUETAS y QUITAR_ETIQUETAS con idsEtiquetas', async () => {
    expect(await errores({ idsTareas: [1], accion: 'AGREGAR_ETIQUETAS', idsEtiquetas: [3, 4] })).toEqual([]);
    expect(await errores({ idsTareas: [1], accion: 'QUITAR_ETIQUETAS', idsEtiquetas: [3] })).toEqual([]);
  });

  it('rechaza una lista de tareas vacía, con duplicados o con ids no positivos', async () => {
    expect(await errores({ idsTareas: [], accion: 'DESASIGNAR' })).toContain('idsTareas');
    expect(await errores({ idsTareas: [1, 1], accion: 'DESASIGNAR' })).toContain('idsTareas');
    expect(await errores({ idsTareas: [0], accion: 'DESASIGNAR' })).toContain('idsTareas');
  });

  it(`rechaza más de ${MAX_TAREAS_ACCION_MASIVA} tareas en una sola operación`, async () => {
    const ids = Array.from({ length: MAX_TAREAS_ACCION_MASIVA + 1 }, (_, i) => i + 1);
    expect(await errores({ idsTareas: ids, accion: 'DESASIGNAR' })).toContain('idsTareas');
  });

  it('rechaza una acción desconocida', async () => {
    expect(await errores({ idsTareas: [1], accion: 'ELIMINAR' })).toContain('accion');
  });

  it('exige el campo propio de cada acción', async () => {
    expect(await errores({ idsTareas: [1], accion: 'MOVER' })).toContain('estadoTarea');
    expect(await errores({ idsTareas: [1], accion: 'MOVER', estadoTarea: 'ARCHIVADA' })).toContain('estadoTarea');
    expect(await errores({ idsTareas: [1], accion: 'ASIGNAR' })).toContain('idUsuario');
    expect(await errores({ idsTareas: [1], accion: 'AGREGAR_ETIQUETAS', idsEtiquetas: [] })).toContain('idsEtiquetas');
    expect(await errores({ idsTareas: [1], accion: 'QUITAR_ETIQUETAS' })).toContain('idsEtiquetas');
  });
});
