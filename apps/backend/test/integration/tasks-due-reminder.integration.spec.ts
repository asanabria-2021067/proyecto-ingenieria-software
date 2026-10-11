import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { EstadoTarea, type PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import {
  createIntegrationProject,
  createIntegrationSprint,
  createIntegrationTask,
  createIntegrationTaskAssignment,
  createIntegrationUser,
} from './setup/fixtures';
import { cleanupIntegrationFixtures } from './setup/cleanup';
import {
  TasksDueReminderService,
  type TareaPorVencer,
  type VentanaRecordatorio,
} from '../../src/tasks/tasks-due-reminder.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import type { NotificationsGateway } from '../../src/notifications/notifications.gateway';

// 08:00 en Guatemala (hora del cron) = 14:00 UTC.
const DIA_1 = new Date('2026-10-10T14:00:00.000Z');
const DIA_2 = new Date('2026-10-11T14:00:00.000Z');
const MANANA = new Date('2026-10-11T00:00:00.000Z');
const PASADO_MANANA = new Date('2026-10-12T00:00:00.000Z');

/** Registra las emisiones en memoria: T-329 no depende todavía del canal de T-330. */
class ServicioObservado extends TasksDueReminderService {
  readonly emitidos: { idTarea: number; ventana: VentanaRecordatorio; responsable: number }[] = [];

  protected override async emitirRecordatorio(
    tarea: TareaPorVencer,
    ventana: VentanaRecordatorio,
    responsable: number,
  ): Promise<void> {
    this.emitidos.push({ idTarea: tarea.idTarea, ventana, responsable });
  }
}

/**
 * HU-186 (T-329) contra PostgreSQL real: detección por fechaLimite (@db.Date),
 * exclusión de HECHO en la consulta y "una sola vez" garantizado por el
 * @@unique(idTarea, ventanaHoras) de `recordatorio_tarea`, también con
 * corridas concurrentes.
 */
describeIntegration('HU-186 T-329 — detección de vencimientos en PostgreSQL real', () => {
  let prisma: PrismaClient;
  const userIds: number[] = [];
  const projectIds: number[] = [];
  const sprintIds: number[] = [];
  const taskIds: number[] = [];
  const assignmentIds: number[] = [];
  let liderId: number;
  let responsableId: number;
  let idProyecto: number;
  let idSprint: number;

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
    liderId = (await createIntegrationUser(prisma)).idUsuario;
    responsableId = (await createIntegrationUser(prisma)).idUsuario;
    userIds.push(liderId, responsableId);
    idProyecto = (await createIntegrationProject(prisma, liderId)).idProyecto;
    projectIds.push(idProyecto);
    idSprint = (await createIntegrationSprint(prisma, idProyecto)).idSprint;
    sprintIds.push(idSprint);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await prisma.notificacion.deleteMany({ where: { idUsuario: { in: userIds } } });
    await prisma.preferenciaNotificacion.deleteMany({ where: { idUsuario: { in: userIds } } });
    // recordatorio_tarea cae por ON DELETE CASCADE al borrar la tarea.
    await cleanupIntegrationFixtures(prisma, { assignmentIds, taskIds });
    assignmentIds.length = 0;
    taskIds.length = 0;
  });

  afterAll(async () => {
    await cleanupIntegrationFixtures(prisma, { sprintIds, projectIds, userIds });
    await prisma.$disconnect();
  });

  async function tareaAsignada(fechaLimite: Date, opciones: { estadoTarea?: EstadoTarea; desasignada?: boolean } = {}) {
    const tarea = await createIntegrationTask(prisma, idProyecto, liderId, idSprint, {
      estadoTarea: opciones.estadoTarea,
    });
    await prisma.tarea.update({ where: { idTarea: tarea.idTarea }, data: { fechaLimite } });
    taskIds.push(tarea.idTarea);
    const asignacion = await createIntegrationTaskAssignment(prisma, tarea.idTarea, responsableId, liderId, {
      desasignadaEn: opciones.desasignada ? new Date() : null,
    });
    assignmentIds.push(asignacion.idAsignacion);
    return tarea;
  }

  function nuevoServicio() {
    return new ServicioObservado(prisma as unknown as PrismaService, {} as NotificationsService);
  }

  /** T-330: servicio real con el NotificationsService real (gateway sin server: solo persiste). */
  function servicioReal() {
    const notifications = new NotificationsService(prisma as unknown as PrismaService, {} as NotificationsGateway);
    return { notifications, service: new TasksDueReminderService(prisma as unknown as PrismaService, notifications) };
  }

  /** Bandeja del responsable tal como la lee el centro de notificaciones. */
  async function bandejaDe(notifications: NotificationsService, idTarea: number) {
    const noLeidas = await notifications.findUnreadForUser(responsableId);
    return noLeidas.filter(
      (n) => n.tipoNotificacion === 'TAREA_POR_VENCER' && (n.datosJson as { taskId?: number })?.taskId === idTarea,
    );
  }

  /** Emisiones de las tareas de esta suite (la base puede tener otras). */
  function propios(service: ServicioObservado) {
    return service.emitidos.filter((e) => taskIds.includes(e.idTarea));
  }

  it('detecta 24 h y 48 h, y excluye HECHO y tareas sin responsable vigente', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(DIA_1);
    const a24 = await tareaAsignada(MANANA);
    const a48 = await tareaAsignada(PASADO_MANANA);
    const hecha = await tareaAsignada(MANANA, { estadoTarea: EstadoTarea.HECHO });
    const sinResponsable = await tareaAsignada(MANANA, { desasignada: true });
    const service = nuevoServicio();

    await service.enviarRecordatoriosDeVencimiento();

    expect(propios(service)).toEqual(
      expect.arrayContaining([
        { idTarea: a24.idTarea, ventana: 24, responsable: responsableId },
        { idTarea: a48.idTarea, ventana: 48, responsable: responsableId },
      ]),
    );
    expect(propios(service)).toHaveLength(2);
    const registrados = await prisma.recordatorioTarea.findMany({
      where: { idTarea: { in: [hecha.idTarea, sinResponsable.idTarea] } },
    });
    expect(registrados).toHaveLength(0);
  });

  it('duplicado: corridas repetidas y concurrentes registran y emiten el aviso una sola vez', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(DIA_1);
    const tarea = await tareaAsignada(MANANA);
    const servicios = [nuevoServicio(), nuevoServicio(), nuevoServicio()];

    await Promise.all(servicios.map((s) => s.enviarRecordatoriosDeVencimiento()));
    await servicios[0].enviarRecordatoriosDeVencimiento();

    const emisiones = servicios.flatMap((s) => propios(s));
    expect(emisiones).toEqual([{ idTarea: tarea.idTarea, ventana: 24, responsable: responsableId }]);
    expect(await prisma.recordatorioTarea.count({ where: { idTarea: tarea.idTarea } })).toBe(1);
  });

  it('48 h y 24 h se registran por separado: la misma tarea recibe ambos, una vez cada uno', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(DIA_1);
    const tarea = await tareaAsignada(PASADO_MANANA);
    const service = nuevoServicio();

    await service.enviarRecordatoriosDeVencimiento();
    vi.setSystemTime(DIA_2);
    await service.enviarRecordatoriosDeVencimiento();
    await service.enviarRecordatoriosDeVencimiento();

    expect(propios(service).map((e) => e.ventana)).toEqual([48, 24]);
    const ventanas = await prisma.recordatorioTarea.findMany({
      where: { idTarea: tarea.idTarea },
      select: { ventanaHoras: true },
      orderBy: { ventanaHoras: 'desc' },
    });
    expect(ventanas.map((v) => v.ventanaHoras)).toEqual([48, 24]);
  });

  it('la base rechaza registrar dos veces el mismo aviso y solo admite ventanas 24/48', async () => {
    const tarea = await tareaAsignada(MANANA);
    await prisma.recordatorioTarea.create({ data: { idTarea: tarea.idTarea, ventanaHoras: 24 } });

    await expect(
      prisma.recordatorioTarea.create({ data: { idTarea: tarea.idTarea, ventanaHoras: 24 } }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.recordatorioTarea.create({ data: { idTarea: tarea.idTarea, ventanaHoras: 12 } }),
    ).rejects.toThrow();
    await prisma.recordatorioTarea.create({ data: { idTarea: tarea.idTarea, ventanaHoras: 48 } });
    expect(await prisma.recordatorioTarea.count({ where: { idTarea: tarea.idTarea } })).toBe(2);
  });

  it('borrar la tarea borra sus registros de aviso (ON DELETE CASCADE)', async () => {
    const tarea = await tareaAsignada(MANANA);
    await prisma.recordatorioTarea.create({ data: { idTarea: tarea.idTarea, ventanaHoras: 48 } });

    await cleanupIntegrationFixtures(prisma, { assignmentIds, taskIds });
    assignmentIds.length = 0;
    taskIds.length = 0;

    expect(await prisma.recordatorioTarea.count({ where: { idTarea: tarea.idTarea } })).toBe(0);
  });

  it('T-330: 24 h y 48 h llegan una vez cada uno a la bandeja del responsable; HECHO no llega', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(DIA_1);
    const a24 = await tareaAsignada(MANANA);
    const a48 = await tareaAsignada(PASADO_MANANA);
    const hecha = await tareaAsignada(MANANA, { estadoTarea: EstadoTarea.HECHO });
    const { notifications, service } = servicioReal();

    await service.enviarRecordatoriosDeVencimiento();
    await service.enviarRecordatoriosDeVencimiento();

    const [n24] = await bandejaDe(notifications, a24.idTarea);
    expect(await bandejaDe(notifications, a24.idTarea)).toHaveLength(1);
    expect(n24.tituloNotificacion).toBe('Tu tarea vence mañana');
    expect(n24.mensajeNotificacion).toContain('vence el 11 de octubre de 2026');
    expect((await bandejaDe(notifications, a48.idTarea)).map((n) => n.tituloNotificacion)).toEqual([
      'Tu tarea vence en 2 días',
    ]);
    expect(await bandejaDe(notifications, hecha.idTarea)).toHaveLength(0);
    expect(await prisma.notificacion.count({ where: { idUsuario: liderId, tipoNotificacion: 'TAREA_POR_VENCER' } })).toBe(0);
  });

  it('T-330 / HU-185: con TAREA_POR_VENCER desactivado no llega nada y no se reintenta', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(DIA_1);
    const tarea = await tareaAsignada(MANANA);
    const { notifications, service } = servicioReal();
    await notifications.updatePreference(responsableId, 'TAREA_POR_VENCER', false);

    await service.enviarRecordatoriosDeVencimiento();
    await service.enviarRecordatoriosDeVencimiento();

    expect(await bandejaDe(notifications, tarea.idTarea)).toHaveLength(0);
    expect(await prisma.recordatorioTarea.count({ where: { idTarea: tarea.idTarea, ventanaHoras: 24 } })).toBe(1);
  });
});
