import { describe, expect, it, vi } from 'vitest';
import { HitosAtrasadosService } from '../src/seguimiento/hitos-atrasados.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import { NOTIFICATION_TEMPLATES } from '../src/notifications/templates/notification.templates';

const AHORA = new Date('2026-11-10T14:00:00.000Z');
const hito = (id: number, fecha: string, tareas: { estadoTarea: string }[]) => ({
  idHito: id,
  idProyecto: 7,
  tituloHito: `Hito ${id}`,
  fechaLimite: new Date(`${fecha}T00:00:00.000Z`),
  tareas,
  proyecto: { tituloProyecto: 'Feria', creadoPor: 99 },
});

function build(candidatos: ReturnType<typeof hito>[]) {
  const prisma = {
    hito: {
      findMany: vi.fn().mockResolvedValue(candidatos),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const notifications = { notifyFromTemplate: vi.fn().mockResolvedValue(undefined) };
  const service = new HitosAtrasadosService(prisma as unknown as PrismaService, notifications as unknown as NotificationsService);
  return { prisma, notifications, service };
}

describe('HitosAtrasadosService (MEJ-54)', () => {
  it('busca hitos vencidos sin aviso previo de proyectos vivos', async () => {
    const { prisma, service } = build([]);
    await service.avisarHitosAtrasados(AHORA);
    expect(prisma.hito.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          fechaLimite: { lt: new Date('2026-11-10T00:00:00.000Z') },
          alertaAtrasoEnviadaEn: null,
          proyecto: { eliminadoEn: null, estadoProyecto: { in: ['PUBLICADO', 'EN_PROGRESO', 'EN_SOLICITUD_CIERRE'] } },
        },
      }),
    );
  });

  it('avisa al líder una vez con los días de atraso y marca el hito', async () => {
    const { prisma, notifications, service } = build([hito(1, '2026-11-07', [{ estadoTarea: 'POR_HACER' }])]);
    await expect(service.avisarHitosAtrasados(AHORA)).resolves.toBe(1);
    expect(prisma.hito.updateMany).toHaveBeenCalledWith({
      where: { idHito: 1, alertaAtrasoEnviadaEn: null },
      data: { alertaAtrasoEnviadaEn: AHORA },
    });
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([99], 'HITO_ATRASADO', {
      hitoTitle: 'Hito 1',
      projectTitle: 'Feria',
      projectId: 7,
      hitoId: 1,
      diasAtraso: 3,
    });
  });

  it('omite el hito cuyas tareas ya están todas hechas', async () => {
    const { prisma, notifications, service } = build([hito(1, '2026-11-01', [{ estadoTarea: 'HECHO' }])]);
    await expect(service.avisarHitosAtrasados(AHORA)).resolves.toBe(0);
    expect(prisma.hito.updateMany).not.toHaveBeenCalled();
    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });

  it('no duplica si otra corrida ya reservó el aviso', async () => {
    const { prisma, notifications, service } = build([hito(1, '2026-11-07', [])]);
    prisma.hito.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.avisarHitosAtrasados(AHORA)).resolves.toBe(0);
    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });

  it('si la emisión falla libera la reserva y sigue con los demás hitos', async () => {
    const { prisma, notifications, service } = build([hito(1, '2026-11-07', []), hito(2, '2026-11-08', [])]);
    notifications.notifyFromTemplate.mockRejectedValueOnce(new Error('socket caído'));
    await expect(service.avisarHitosAtrasados(AHORA)).resolves.toBe(1);
    expect(prisma.hito.update).toHaveBeenCalledWith({ where: { idHito: 1 }, data: { alertaAtrasoEnviadaEn: null } });
    expect(notifications.notifyFromTemplate).toHaveBeenCalledTimes(2);
  });

  it('la plantilla redacta el atraso en singular y plural', () => {
    const t = NOTIFICATION_TEMPLATES.HITO_ATRASADO;
    const base = { hitoTitle: 'Demo', projectTitle: 'Feria', projectId: 1, hitoId: 2 };
    expect(t.title).toBe('Un hito está atrasado');
    expect(t.message({ ...base, diasAtraso: 1 })).toBe('El hito "Demo" del proyecto "Feria" lleva 1 día de atraso.');
    expect(t.message({ ...base, diasAtraso: 4 })).toBe('El hito "Demo" del proyecto "Feria" lleva 4 días de atraso.');
  });
});
