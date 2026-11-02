import { describe, expect, it, vi } from 'vitest';
import { HorasAvisosService } from '../src/horas-semestre/horas-avisos.service';

const HOY = '2026-11-02';

function crear(opts: {
  enRiesgo?: { BECA?: number[]; EXTENSION?: number[] };
  yaAvisados?: number[];
  asignaciones?: { idAsignacion: number; idUsuario: number; idParticipacion: number | null; tarea: { idTarea: number; idProyecto: number; tituloTarea: string; proyecto: { creadoPor: number } } }[];
  conRegistro?: number[]; // idAsignacion con horas recientes
}) {
  const prisma = {
    notificacion: { findMany: vi.fn(async () => (opts.yaAvisados ?? []).map((idUsuario) => ({ idUsuario }))) },
    asignacionTarea: { findMany: vi.fn(async () => opts.asignaciones ?? []) },
    registroTiempoTarea: { findMany: vi.fn(async () => (opts.conRegistro ?? []).map((idAsignacion) => ({ idAsignacion }))) },
  };
  const horas = {
    recorrerTodas: vi.fn(async ({ tipo }: { tipo: 'BECA' | 'EXTENSION' }) => ({
      filas: (opts.enRiesgo?.[tipo] ?? []).map((idUsuario) => ({ idUsuario })),
    })),
  };
  const notifications = { notifyFromTemplate: vi.fn(async () => undefined) };
  const service = new HorasAvisosService(prisma as never, horas as never, notifications as never);
  return { service, prisma, notifications };
}

// idAsignacion = idTarea para simplificar los casos.
const asignacion = (idUsuario: number, idTarea: number, idParticipacion: number | null = 1, creadoPor = 99) => ({
  idAsignacion: idTarea,
  idUsuario,
  idParticipacion,
  tarea: { idTarea, idProyecto: 5, tituloTarea: `Tarea ${idTarea}`, proyecto: { creadoPor } },
});

describe('HorasAvisosService.avisarEnRiesgo (MEJ-13)', () => {
  it('avisa una vez con los tipos en riesgo de cada estudiante', async () => {
    const { service, notifications } = crear({ enRiesgo: { BECA: [1, 2], EXTENSION: [2] } });
    expect(await service.avisarEnRiesgo(HOY)).toBe(2);
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([1], 'HORAS_EN_RIESGO', { tipos: ['beca'] });
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([2], 'HORAS_EN_RIESGO', { tipos: ['beca', 'extension'] });
  });

  it('no repite el aviso a quien ya lo recibio en la semana', async () => {
    const { service, notifications } = crear({ enRiesgo: { BECA: [1, 2] }, yaAvisados: [1] });
    expect(await service.avisarEnRiesgo(HOY)).toBe(1);
    expect(notifications.notifyFromTemplate).toHaveBeenCalledTimes(1);
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([2], 'HORAS_EN_RIESGO', { tipos: ['beca'] });
  });

  it('la ventana semanal arranca 6 dias antes del dia de hoy (hora de Guatemala)', async () => {
    const { service, prisma } = crear({ enRiesgo: { BECA: [1] } });
    await service.avisarEnRiesgo(HOY);
    const where = (prisma.notificacion.findMany.mock.calls[0] as unknown as [{ where: { creadaEn: { gte: Date } } }])[0].where;
    expect(where.creadaEn.gte.toISOString()).toBe('2026-10-27T06:00:00.000Z');
  });

  it('sin estudiantes en riesgo no consulta notificaciones', async () => {
    const { service, prisma } = crear({});
    expect(await service.avisarEnRiesgo(HOY)).toBe(0);
    expect(prisma.notificacion.findMany).not.toHaveBeenCalled();
  });
});

describe('HorasAvisosService.recordarRegistroDeHoras (MEJ-60)', () => {
  it('un recordatorio por estudiante con la cantidad de tareas en progreso', async () => {
    const { service, notifications } = crear({ asignaciones: [asignacion(1, 10), asignacion(1, 11), asignacion(2, 12)] });
    expect(await service.recordarRegistroDeHoras(HOY)).toBe(2);
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([1], 'RECORDATORIO_HORAS', {
      cantidad: 2,
      taskTitle: 'Tarea 10',
      taskId: 10,
      projectId: 5,
    });
  });

  it('omite la tarea con horas recientes y a quien ya fue recordado', async () => {
    const { service, notifications } = crear({
      asignaciones: [asignacion(1, 10), asignacion(2, 12), asignacion(3, 13)],
      conRegistro: [10],
      yaAvisados: [2],
    });
    expect(await service.recordarRegistroDeHoras(HOY)).toBe(1);
    expect(notifications.notifyFromTemplate).toHaveBeenCalledTimes(1);
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([3], 'RECORDATORIO_HORAS', expect.objectContaining({ taskId: 13 }));
  });

  it('horas en otra tarea no anulan el recordatorio de una tarea en progreso sin horas', async () => {
    const { service, notifications, prisma } = crear({ asignaciones: [asignacion(1, 10), asignacion(1, 11)], conRegistro: [11] });
    expect(await service.recordarRegistroDeHoras(HOY)).toBe(1);
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([1], 'RECORDATORIO_HORAS', expect.objectContaining({ cantidad: 1, taskId: 10 }));
    const args = (prisma.registroTiempoTarea.findMany.mock.calls[0] as unknown as [{ where: { idAsignacion: { in: number[] }; fecha: { gte: Date } } }])[0];
    expect(args.where.idAsignacion.in).toEqual([10, 11]);
    expect(args.where.fecha.gte.toISOString()).toBe('2026-10-31T00:00:00.000Z');
  });

  it('solo considera tareas donde se pueden registrar horas (proyecto publicado o en progreso, sprint activo, participacion activa)', async () => {
    const { service, prisma } = crear({ asignaciones: [asignacion(1, 10)] });
    await service.recordarRegistroDeHoras(HOY);
    const where = (prisma.asignacionTarea.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where).toMatchObject({
      origenReporte: 'GRANULAR',
      reconocidoEn: null,
      OR: [{ participacion: { estadoParticipacion: 'ACTIVO' } }, { idParticipacion: null }],
      tarea: {
        OR: [{ idSprint: null }, { sprint: { estado: 'ACTIVO' } }],
        proyecto: { estadoProyecto: { in: ['PUBLICADO', 'EN_PROGRESO'] }, sprints: { some: { estado: 'ACTIVO' } } },
      },
    });
  });

  it('avisa al lider por sus tareas autoasignadas pero no a un usuario sin participacion que no es el creador', async () => {
    const { service, notifications } = crear({ asignaciones: [asignacion(1, 10, null, 1), asignacion(2, 11, null, 99)] });
    expect(await service.recordarRegistroDeHoras(HOY)).toBe(1);
    expect(notifications.notifyFromTemplate).toHaveBeenCalledTimes(1);
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([1], 'RECORDATORIO_HORAS', expect.objectContaining({ taskId: 10 }));
  });

  it('correr sigue con el recordatorio aunque el aviso de riesgo falle, sin rechazos sin manejar', async () => {
    const { service } = crear({});
    vi.spyOn(service, 'avisarEnRiesgo').mockRejectedValue(new Error('x'));
    const recordar = vi.spyOn(service, 'recordarRegistroDeHoras').mockResolvedValue(0);
    await service.correr();
    expect(recordar).toHaveBeenCalled();
  });

  it('la ventana de 3 dias deja pasar el siguiente recordatorio exactamente 3 dias despues', async () => {
    const { service, prisma } = crear({ asignaciones: [asignacion(1, 10)] });
    await service.recordarRegistroDeHoras(HOY);
    const where = (prisma.notificacion.findMany.mock.calls[0] as unknown as [{ where: { creadaEn: { gte: Date } } }])[0].where;
    expect(where.creadaEn.gte.toISOString()).toBe('2026-10-31T06:00:00.000Z');
  });

  it('sin tareas en progreso no envia nada', async () => {
    const { service, notifications } = crear({});
    expect(await service.recordarRegistroDeHoras(HOY)).toBe(0);
    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });
});
