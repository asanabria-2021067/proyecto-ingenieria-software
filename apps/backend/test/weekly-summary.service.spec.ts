import { describe, expect, it, vi } from 'vitest';
import { WeeklySummaryService, hoyGuatemala } from '../src/tasks/weekly-summary.service';
import { NOTIFICATION_TEMPLATES } from '../src/notifications/templates/notification.templates';

// Lunes 02/11/2026 07:00 en Guatemala (UTC-6) = 13:00 UTC.
const AHORA = new Date('2026-11-02T13:00:00.000Z');

function montar(opciones: {
  tareas?: { idUsuario: number; _count: { _all: number } }[];
  horas?: { idUsuario: number; _sum: { horas: number | null } }[];
  postulaciones?: { idUsuarioPostulante: number; _count: { _all: number } }[];
  activos?: number[];
}) {
  const tx = {};
  const prisma = {
    asignacionTarea: { groupBy: vi.fn().mockResolvedValue(opciones.tareas ?? []) },
    registroTiempoTarea: { groupBy: vi.fn().mockResolvedValue(opciones.horas ?? []) },
    postulacion: { groupBy: vi.fn().mockResolvedValue(opciones.postulaciones ?? []) },
    usuario: { findMany: vi.fn().mockResolvedValue((opciones.activos ?? []).map((idUsuario) => ({ idUsuario }))) },
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
  const notifications = {
    persistTemplateTx: vi.fn().mockResolvedValue({ count: 1 }),
    publishEffects: vi.fn().mockResolvedValue(undefined),
  };
  const service = new WeeklySummaryService(prisma as never, notifications as never);
  return { service, prisma, notifications };
}

describe('MEJ-31: WeeklySummaryService', () => {
  it('hoyGuatemala usa el día calendario local, no el de UTC', () => {
    expect(hoyGuatemala(new Date('2026-11-03T03:00:00.000Z')).toISOString()).toBe('2026-11-02T00:00:00.000Z');
  });

  it('avisa a quien tiene algo que contar, con clave por lunes, y omite inactivos', async () => {
    const { service, notifications } = montar({
      tareas: [{ idUsuario: 1, _count: { _all: 3 } }],
      horas: [{ idUsuario: 1, _sum: { horas: 4.5 } }, { idUsuario: 2, _sum: { horas: 2 } }],
      postulaciones: [{ idUsuarioPostulante: 3, _count: { _all: 1 } }],
      activos: [1, 3],
    });

    expect(await service.enviarTuSemana(AHORA)).toBe(2);

    expect(notifications.persistTemplateTx).toHaveBeenCalledTimes(2);
    const [, ids, tipo, datos, , opciones] = notifications.persistTemplateTx.mock.calls[0];
    expect(ids).toEqual([1]);
    expect(tipo).toBe('TU_SEMANA');
    expect(datos).toEqual({ tareasPorVencer: 3, horasSemanaPasada: 4.5, postulacionesPendientes: 0 });
    expect(opciones).toEqual({ claveIdempotencia: 'tu-semana:2026-11-02' });
    expect(notifications.persistTemplateTx.mock.calls[1][1]).toEqual([3]);
  });

  it('sin actividad no consulta usuarios ni notifica', async () => {
    const { service, prisma, notifications } = montar({});
    expect(await service.enviarTuSemana(AHORA)).toBe(0);
    expect(prisma.usuario.findMany).not.toHaveBeenCalled();
    expect(notifications.persistTemplateTx).not.toHaveBeenCalled();
  });

  it('un fallo con un usuario no frena a los demás', async () => {
    const { service, notifications } = montar({
      tareas: [{ idUsuario: 1, _count: { _all: 1 } }, { idUsuario: 2, _count: { _all: 1 } }],
      activos: [1, 2],
    });
    notifications.persistTemplateTx.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ count: 1 });
    expect(await service.enviarTuSemana(AHORA)).toBe(1);
  });

  it('la plantilla pluraliza y omite lo que está en cero', () => {
    const { message } = NOTIFICATION_TEMPLATES.TU_SEMANA;
    expect(message({ tareasPorVencer: 1, horasSemanaPasada: 0, postulacionesPendientes: 2 })).toBe(
      '1 tarea vence esta semana · 0 h registradas la semana pasada · 2 postulaciones pendientes.',
    );
    expect(message({ tareasPorVencer: 0, horasSemanaPasada: 3, postulacionesPendientes: 0 })).toBe('3 h registradas la semana pasada.');
  });
});
