import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { EventsReminderService } from '../src/events/events-reminder.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/notifications/notifications.service';

const PROJECT_ID = 5;
const LEADER_ID = 1;
const MEMBER_ID = 2;
const EVENT_ID = 10;

function makePrisma() {
  return {
    eventoProyecto: { findMany: vi.fn(), update: vi.fn() },
    participacionProyecto: { findMany: vi.fn().mockResolvedValue([{ idUsuario: MEMBER_ID }]) },
  } as unknown as PrismaService & {
    eventoProyecto: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    participacionProyecto: { findMany: ReturnType<typeof vi.fn> };
  };
}

function makeNotifications() {
  return { notifyFromTemplate: vi.fn().mockResolvedValue(undefined) } as unknown as NotificationsService & {
    notifyFromTemplate: ReturnType<typeof vi.fn>;
  };
}

function evento(overrides: Record<string, unknown> = {}) {
  return {
    idEvento: EVENT_ID,
    idProyecto: PROJECT_ID,
    tituloEvento: 'Kickoff',
    fechaInicio: new Date('2026-10-01T15:00:00.000Z'),
    antelacionMinutos: 60,
    proyecto: { tituloProyecto: 'Proyecto X', creadoPor: LEADER_ID },
    ...overrides,
  };
}

/**
 * T-266: cubre exactamente el contrato de T-265 — se emite dentro de la
 * antelación configurada, solo a integrantes del proyecto, nunca para un
 * evento ya pasado, y marca recordatorioEnviadoEn para no reenviar.
 */
describe('EventsReminderService.enviarRecordatoriosPendientes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T14:30:00.000Z')); // 30 min antes del evento
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('envía el recordatorio cuando ya se cruzó la antelación configurada (60 min) y marca recordatorioEnviadoEn', async () => {
    const prisma = makePrisma();
    prisma.eventoProyecto.findMany.mockResolvedValue([evento()]);
    const notifications = makeNotifications();
    const service = new EventsReminderService(prisma, notifications);

    await service.enviarRecordatoriosPendientes();

    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith(
      [LEADER_ID, MEMBER_ID],
      'RECORDATORIO_EVENTO',
      expect.objectContaining({ eventId: EVENT_ID, projectId: PROJECT_ID }),
    );
    expect(prisma.eventoProyecto.update).toHaveBeenCalledWith({
      where: { idEvento: EVENT_ID },
      data: { recordatorioEnviadoEn: expect.any(Date) },
    });
  });

  it('no envía si todavía no se cruza la antelación (evento en 2 horas, antelación de 60 min)', async () => {
    const prisma = makePrisma();
    prisma.eventoProyecto.findMany.mockResolvedValue([
      evento({ fechaInicio: new Date('2026-10-01T16:30:00.000Z') }),
    ]);
    const notifications = makeNotifications();
    const service = new EventsReminderService(prisma, notifications);

    await service.enviarRecordatoriosPendientes();

    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    expect(prisma.eventoProyecto.update).not.toHaveBeenCalled();
  });

  it('respeta antelación configurada distinta del default (15 min)', async () => {
    const prisma = makePrisma();
    // Evento a las 14:40 (10 min), antelación 15 min -> ya debe enviarse.
    prisma.eventoProyecto.findMany.mockResolvedValue([
      evento({ fechaInicio: new Date('2026-10-01T14:40:00.000Z'), antelacionMinutos: 15 }),
    ]);
    const notifications = makeNotifications();
    const service = new EventsReminderService(prisma, notifications);

    await service.enviarRecordatoriosPendientes();

    expect(notifications.notifyFromTemplate).toHaveBeenCalledTimes(1);
  });

  it('solo notifica a integrantes del proyecto del evento (líder + participaciones ACTIVO), no a todo el sistema', async () => {
    const prisma = makePrisma();
    prisma.eventoProyecto.findMany.mockResolvedValue([evento()]);
    const notifications = makeNotifications();
    const service = new EventsReminderService(prisma, notifications);

    await service.enviarRecordatoriosPendientes();

    expect(prisma.participacionProyecto.findMany).toHaveBeenCalledWith({
      where: { estadoParticipacion: 'ACTIVO', rolProyecto: { idProyecto: PROJECT_ID } },
      select: { idUsuario: true },
    });
  });

  it('la consulta de candidatos ya excluye eventos cancelados, ya enviados, pasados y de proyectos eliminados (where declarativo)', async () => {
    const prisma = makePrisma();
    prisma.eventoProyecto.findMany.mockResolvedValue([]);
    const notifications = makeNotifications();
    const service = new EventsReminderService(prisma, notifications);

    await service.enviarRecordatoriosPendientes();

    expect(prisma.eventoProyecto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eliminadoEn: null,
          recordatorioEnviadoEn: null,
          fechaInicio: { gt: expect.any(Date) },
          proyecto: { eliminadoEn: null },
        }),
      }),
    );
  });

  it('formatea fechaInicioTexto en America/Guatemala, sin depender de la TZ del proceso', async () => {
    const prisma = makePrisma();
    prisma.eventoProyecto.findMany.mockResolvedValue([evento()]);
    const notifications = makeNotifications();
    const service = new EventsReminderService(prisma, notifications);

    await service.enviarRecordatoriosPendientes();

    const payload = notifications.notifyFromTemplate.mock.calls[0][2];
    expect(payload.fechaInicioTexto).toBe(
      new Date('2026-10-01T15:00:00.000Z').toLocaleString('es-GT', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'America/Guatemala',
      }),
    );
  });

  it('un fallo al enviar (p. ej. notifyFromTemplate rechaza) no detiene el resto ni bloquea el cron', async () => {
    const prisma = makePrisma();
    prisma.eventoProyecto.findMany.mockResolvedValue([evento(), evento({ idEvento: 11 })]);
    const notifications = makeNotifications();
    notifications.notifyFromTemplate.mockRejectedValueOnce(new Error('socket caído'));
    const service = new EventsReminderService(prisma, notifications);

    await expect(service.enviarRecordatoriosPendientes()).resolves.toBeUndefined();

    expect(notifications.notifyFromTemplate).toHaveBeenCalledTimes(2);
    // El evento fallido no se marca como enviado: puede reintentarse en la próxima corrida.
    expect(prisma.eventoProyecto.update).toHaveBeenCalledTimes(1);
  });
});
