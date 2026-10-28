import { describe, expect, it, vi } from 'vitest';
import { calcularMetrica } from '../src/insignias/insignias.metricas';

function makeDb(overrides: { suma?: unknown } = {}) {
  return {
    tarea: { count: vi.fn().mockResolvedValue(7) },
    horasParticipacion: { aggregate: vi.fn().mockResolvedValue({ _sum: { horasAprobadas: overrides.suma ?? null } }) },
    proyecto: { count: vi.fn().mockResolvedValue(3) },
    postulacion: { count: vi.fn().mockResolvedValue(4) },
    comentario: { count: vi.fn().mockResolvedValue(5) },
    sprint: { count: vi.fn().mockResolvedValue(2) },
  };
}
type Db = Parameters<typeof calcularMetrica>[0];
const run = (db: ReturnType<typeof makeDb>, clave: Parameters<typeof calcularMetrica>[1]) =>
  calcularMetrica(db as unknown as Db, clave, 9);

describe('métricas de insignias (HU-190)', () => {
  it('tareas: HECHO, no eliminadas, con asignación del usuario (cualquier tramo)', async () => {
    const db = makeDb();
    expect(await run(db, 'tareas')).toBe(7);
    expect(db.tarea.count).toHaveBeenCalledWith({
      where: { estadoTarea: 'HECHO', eliminadoEn: null, asignaciones: { some: { idUsuario: 9 } } },
    });
  });

  it('horas: suma horasAprobadas de registros APROBADA', async () => {
    const db = makeDb({ suma: '10.5' });
    await run(db, 'horas');
    expect(db.horasParticipacion.aggregate).toHaveBeenCalledWith({
      _sum: { horasAprobadas: true },
      where: { estadoHoras: 'APROBADA', participacion: { idUsuario: 9 } },
    });
  });

  it.each([
    [null, 0],
    ['0', 0],
    ['4.99', 4],
    ['5', 5],
    ['5.01', 5],
    ['24.999', 24],
    ['25.00', 25],
  ])('horas: %s se redondea hacia abajo a %i', async (suma, esperado) => {
    expect(await run(makeDb({ suma }), 'horas')).toBe(esperado);
  });

  it('cerrados: CERRADO, participación ACTIVO o COMPLETADO, sin contar al creador', async () => {
    const db = makeDb();
    await run(db, 'cerrados');
    expect(db.proyecto.count).toHaveBeenCalledWith({
      where: {
        estadoProyecto: 'CERRADO',
        eliminadoEn: null,
        creadoPor: { not: 9 },
        roles: { some: { participaciones: { some: { idUsuario: 9, estadoParticipacion: { in: ['ACTIVO', 'COMPLETADO'] } } } } },
      },
    });
  });

  it('liderados: CERRADO con creadoPor = usuario', async () => {
    const db = makeDb();
    await run(db, 'liderados');
    expect(db.proyecto.count).toHaveBeenCalledWith({ where: { estadoProyecto: 'CERRADO', eliminadoEn: null, creadoPor: 9 } });
  });

  it('postulaciones: solo ACEPTADA del postulante', async () => {
    const db = makeDb();
    expect(await run(db, 'postulaciones')).toBe(4);
    expect(db.postulacion.count).toHaveBeenCalledWith({
      where: { idUsuarioPostulante: 9, estadoPostulacion: 'ACEPTADA' },
    });
  });

  it('comentarios: con idTarea y sin eliminar', async () => {
    const db = makeDb();
    expect(await run(db, 'comentarios')).toBe(5);
    expect(db.comentario.count).toHaveBeenCalledWith({
      where: { idAutor: 9, idTarea: { not: null }, eliminadoEn: null },
    });
  });

  it('sprints: CERRADO con al menos una tarea HECHO del usuario', async () => {
    const db = makeDb();
    expect(await run(db, 'sprints')).toBe(2);
    expect(db.sprint.count).toHaveBeenCalledWith({
      where: {
        estado: 'CERRADO',
        tareas: { some: { estadoTarea: 'HECHO', eliminadoEn: null, asignaciones: { some: { idUsuario: 9 } } } },
      },
    });
  });
});
