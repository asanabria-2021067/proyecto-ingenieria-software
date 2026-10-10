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
    // G04-C16: el servicio consulta a quién ya avisó. Por defecto, a nadie (primer envío).
    notificacion: { findMany: vi.fn().mockResolvedValue([]) },
  } as unknown as PrismaService & {
    eventoProyecto: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    participacionProyecto: { findMany: ReturnType<typeof vi.fn> };
    notificacion: { findMany: ReturnType<typeof vi.fn> };
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
    invitados: [],
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

  it('con invitados, solo los invitados que siguen en el proyecto y el líder reciben el recordatorio (HU-184)', async () => {
    const OTRO_ID = 3;
    const prisma = makePrisma();
    prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: MEMBER_ID }, { idUsuario: OTRO_ID }]);
    // 77 ya no es integrante: no recibe nada aunque siga en la lista.
    prisma.eventoProyecto.findMany.mockResolvedValue([evento({ invitados: [OTRO_ID, 77] })]);
    const notifications = makeNotifications();
    const service = new EventsReminderService(prisma, notifications);

    await service.enviarRecordatoriosPendientes();

    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([LEADER_ID, OTRO_ID], 'RECORDATORIO_EVENTO', expect.any(Object));
  });
});

/**
 * G04-C16 (UI-22): la marca `recordatorioEnviadoEn` es global por evento. Al
 * reabrirla porque entró un invitado nuevo, el aviso debe llegar solo a quien
 * todavía no lo tiene: nunca un duplicado, nunca un reenvío a todos.
 */
describe('EventsReminderService — sin duplicados al reabrir el recordatorio (G04-C16, UI-22)', () => {
  const NUEVO_ID = 3;
  const INICIO = new Date('2026-10-01T15:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T14:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function preparar(yaAvisados: number[], overrides: Record<string, unknown> = {}) {
    const prisma = makePrisma();
    prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: MEMBER_ID }, { idUsuario: NUEVO_ID }]);
    prisma.eventoProyecto.findMany.mockResolvedValue([evento({ invitados: [MEMBER_ID, NUEVO_ID], ...overrides })]);
    prisma.notificacion.findMany.mockResolvedValue(yaAvisados.map((idUsuario) => ({ idUsuario })));
    const notifications = makeNotifications();
    return { prisma, notifications, service: new EventsReminderService(prisma, notifications) };
  }

  it('avisa únicamente al invitado nuevo: el líder y quien ya lo recibió no se repiten', async () => {
    const { prisma, notifications, service } = preparar([LEADER_ID, MEMBER_ID]);

    await service.enviarRecordatoriosPendientes();

    expect(notifications.notifyFromTemplate).toHaveBeenCalledTimes(1);
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([NUEVO_ID], 'RECORDATORIO_EVENTO', expect.objectContaining({ eventId: EVENT_ID }));
    expect(prisma.eventoProyecto.update).toHaveBeenCalledWith({ where: { idEvento: EVENT_ID }, data: { recordatorioEnviadoEn: expect.any(Date) } });
  });

  it('si todos ya tienen el aviso no envía nada, pero cierra de nuevo la marca (no reintenta cada 5 minutos)', async () => {
    const { prisma, notifications, service } = preparar([LEADER_ID, MEMBER_ID, NUEVO_ID]);

    await service.enviarRecordatoriosPendientes();

    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    expect(prisma.eventoProyecto.update).toHaveBeenCalledTimes(1);
  });

  it('la evidencia se busca en las notificaciones persistidas: este evento, esta hora de inicio y solo sus destinatarios', async () => {
    const { prisma, service } = preparar([]);

    await service.enviarRecordatoriosPendientes();

    expect(prisma.notificacion.findMany).toHaveBeenCalledWith({
      where: {
        tipoNotificacion: 'RECORDATORIO_EVENTO',
        idUsuario: { in: [LEADER_ID, MEMBER_ID, NUEVO_ID] },
        datosJson: { path: ['eventId'], equals: EVENT_ID },
        OR: [
          { datosJson: { path: ['fechaInicioIso'], equals: INICIO.toISOString() } },
          { datosJson: { path: ['fechaInicioTexto'], equals: expect.stringContaining('2026') } },
        ],
      },
      select: { idUsuario: true },
    });
  });

  it('el aviso guarda la hora de inicio como instante ISO, la clave con la que se reconoce después', async () => {
    const { notifications, service } = preparar([]);
    await service.enviarRecordatoriosPendientes();
    const datos = notifications.notifyFromTemplate.mock.calls[0][2] as { fechaInicioIso: string; fechaInicioTexto: string };
    expect(datos.fechaInicioIso).toBe(INICIO.toISOString());
    expect(datos.fechaInicioTexto).toContain('9:00');
  });

  it('si el evento se movió, los avisos de la hora anterior no cuentan: todos reciben el de la fecha nueva (T-265 intacto)', async () => {
    const NUEVO_INICIO = new Date('2026-10-01T15:20:00.000Z');
    const { prisma, notifications, service } = preparar([], { fechaInicio: NUEVO_INICIO });
    // La tabla solo tiene avisos de las 15:00: la consulta por las 15:20 no encuentra a nadie.
    prisma.notificacion.findMany.mockImplementation(async ({ where }: { where: { OR: { datosJson: { equals: string } }[] } }) =>
      where.OR[0].datosJson.equals === INICIO.toISOString() ? [{ idUsuario: LEADER_ID }, { idUsuario: MEMBER_ID }, { idUsuario: NUEVO_ID }] : [],
    );

    await service.enviarRecordatoriosPendientes();

    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([LEADER_ID, MEMBER_ID, NUEVO_ID], 'RECORDATORIO_EVENTO', expect.objectContaining({ fechaInicioIso: NUEVO_INICIO.toISOString() }));
  });

  it('si no se puede consultar a quién se avisó, no se envía a nadie ni se marca el evento (se reintenta en la siguiente pasada)', async () => {
    const { prisma, notifications, service } = preparar([]);
    prisma.notificacion.findMany.mockRejectedValue(new Error('conexión perdida'));

    await expect(service.enviarRecordatoriosPendientes()).resolves.toBeUndefined();

    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    expect(prisma.eventoProyecto.update).not.toHaveBeenCalled();
  });

  it('un invitado que ya no es integrante activo sigue sin recibir nada, aunque nunca se le haya avisado', async () => {
    const { prisma, notifications, service } = preparar([LEADER_ID]);
    prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: MEMBER_ID }]); // NUEVO_ID se retiró

    await service.enviarRecordatoriosPendientes();

    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([MEMBER_ID], 'RECORDATORIO_EVENTO', expect.anything());
    expect(prisma.notificacion.findMany.mock.calls[0][0].where.idUsuario).toEqual({ in: [LEADER_ID, MEMBER_ID] });
  });

  it('en un evento de todo el proyecto que se reabre, solo recibe aviso el integrante que faltaba', async () => {
    const { notifications, service } = preparar([LEADER_ID, MEMBER_ID], { invitados: [] });
    await service.enviarRecordatoriosPendientes();
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([NUEVO_ID], 'RECORDATORIO_EVENTO', expect.anything());
  });
});
