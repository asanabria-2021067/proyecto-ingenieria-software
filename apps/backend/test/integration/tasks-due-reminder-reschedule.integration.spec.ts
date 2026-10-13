import { makeTimeRecordsService } from '../helpers/time-records.fixture';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
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
import { TasksService } from '../../src/tasks/tasks.service';
import { TasksContextService } from '../../src/tasks/tasks-context.service';
import { TasksAuthorizationService } from '../../src/tasks/tasks-authorization.service';
import { TasksRelationsService } from '../../src/tasks/tasks-relations.service';
import { ProjectIdResolverService } from '../../src/common/project-policy/project-id-resolver.service';
import { ProjectPolicyService } from '../../src/common/project-policy/project-policy.service';
import { ProjectTransactionService } from '../../src/common/project-policy/project-transaction.service';
import { ProjectReadPolicyService } from '../../src/common/project-policy/project-read-policy.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import type { NotificationsGateway } from '../../src/notifications/notifications.gateway';

// 08:00 en Guatemala (hora del cron) = 14:00 UTC.
const a8am = (dia: string) => new Date(`${dia}T14:00:00.000Z`);
const fecha = (dia: string) => new Date(`${dia}T00:00:00.000Z`);

class ServicioObservado extends TasksDueReminderService {
  readonly emitidos: { idTarea: number; ventana: VentanaRecordatorio; vence: string }[] = [];

  protected override async emitirRecordatorio(tarea: TareaPorVencer, ventana: VentanaRecordatorio): Promise<void> {
    this.emitidos.push({
      idTarea: tarea.idTarea,
      ventana,
      vence: (tarea.fechaLimite as Date).toISOString().slice(0, 10),
    });
  }
}

/**
 * HU-186: reprogramar la fecha límite con el TasksService real, sobre
 * PostgreSQL real. Los avisos registrados eran de la fecha anterior: al
 * cambiarla de verdad se invalidan, y el job vuelve a avisar a 48 h / 24 h
 * de la nueva, sin duplicar y sin borrar lo ya entregado.
 */
describeIntegration('HU-186 — reprogramar la fecha límite reinicia los avisos de vencimiento', () => {
  let prisma: PrismaClient;
  let tasks: TasksService;
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
    idProyecto = (await createIntegrationProject(prisma, liderId, { estadoProyecto: 'EN_PROGRESO' })).idProyecto;
    projectIds.push(idProyecto);
    idSprint = (await createIntegrationSprint(prisma, idProyecto, { estado: 'ACTIVO' })).idSprint;
    sprintIds.push(idSprint);

    const db = prisma as unknown as PrismaService;
    const context = new TasksContextService(db);
    const sinNotificar = {
      notifyFromTemplate: async () => undefined,
      notifyUsers: async () => undefined,
      notifyRoleMembers: async () => undefined,
      notifyProjectActiveParticipants: async () => undefined,
    } as unknown as NotificationsService;
    tasks = new TasksService(
      db,
      new TasksAuthorizationService(context),
      new TasksRelationsService(db, context),
      sinNotificar,
      context,
      new ProjectTransactionService(db),
      new ProjectPolicyService(new ProjectIdResolverService(db)),
      new ProjectReadPolicyService(db),
      makeTimeRecordsService(db),
    );
  });

  afterEach(async () => {
    vi.useRealTimers();
    await prisma.notificacion.deleteMany({ where: { idUsuario: { in: userIds } } });
    await cleanupIntegrationFixtures(prisma, { assignmentIds, taskIds });
    assignmentIds.length = 0;
    taskIds.length = 0;
  });

  afterAll(async () => {
    await cleanupIntegrationFixtures(prisma, { sprintIds, projectIds, userIds });
    await prisma.$disconnect();
  });

  async function tareaQueVence(dia: string) {
    const tarea = await createIntegrationTask(prisma, idProyecto, liderId, idSprint);
    await prisma.tarea.update({ where: { idTarea: tarea.idTarea }, data: { fechaLimite: fecha(dia) } });
    taskIds.push(tarea.idTarea);
    const asignacion = await createIntegrationTaskAssignment(prisma, tarea.idTarea, responsableId, liderId);
    assignmentIds.push(asignacion.idAsignacion);
    return tarea.idTarea;
  }

  const job = new Map<number, ServicioObservado>();
  /** Corre el job dos veces a las 8:00 del día dado: la repetición nunca debe agregar avisos. */
  async function correrJob(idTarea: number, dia: string) {
    let service = job.get(idTarea);
    if (!service) {
      service = new ServicioObservado(prisma as unknown as PrismaService, {} as NotificationsService);
      job.set(idTarea, service);
    }
    vi.setSystemTime(a8am(dia));
    await service.enviarRecordatoriosDeVencimiento();
    await service.enviarRecordatoriosDeVencimiento();
    return service.emitidos.filter((e) => e.idTarea === idTarea).map((e) => `${e.ventana}h→${e.vence}`);
  }

  const reprogramar = (idTarea: number, dia: string) =>
    tasks.update(idProyecto, idTarea, liderId, { fechaLimite: dia });

  const ventanasRegistradas = async (idTarea: number) =>
    (
      await prisma.recordatorioTarea.findMany({
        where: { idTarea },
        select: { ventanaHoras: true },
        orderBy: { ventanaHoras: 'desc' },
      })
    ).map((r) => r.ventanaHoras);

  it('tras el aviso de 48 h: la fecha nueva vuelve a recibir 48 h y 24 h, una vez cada uno', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const idTarea = await tareaQueVence('2026-10-12');
    expect(await correrJob(idTarea, '2026-10-10')).toEqual(['48h→2026-10-12']);

    await reprogramar(idTarea, '2026-10-20');
    expect(await ventanasRegistradas(idTarea)).toEqual([]);

    // El día en que habría vencido originalmente ya no se avisa nada.
    expect(await correrJob(idTarea, '2026-10-11')).toEqual(['48h→2026-10-12']);
    await correrJob(idTarea, '2026-10-18');
    expect(await correrJob(idTarea, '2026-10-19')).toEqual(['48h→2026-10-12', '48h→2026-10-20', '24h→2026-10-20']);
    expect(await ventanasRegistradas(idTarea)).toEqual([48, 24]);
  });

  it('tras el aviso de 24 h: la fecha nueva vuelve a recibir el de 24 h', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const idTarea = await tareaQueVence('2026-10-11');
    expect(await correrJob(idTarea, '2026-10-10')).toEqual(['24h→2026-10-11']);

    await reprogramar(idTarea, '2026-10-20');

    expect(await correrJob(idTarea, '2026-10-19')).toEqual(['24h→2026-10-11', '24h→2026-10-20']);
  });

  it('tras ambos avisos: se reinician los dos', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const idTarea = await tareaQueVence('2026-10-12');
    await correrJob(idTarea, '2026-10-10');
    await correrJob(idTarea, '2026-10-11');
    expect(await ventanasRegistradas(idTarea)).toEqual([48, 24]);

    await reprogramar(idTarea, '2026-10-20');
    expect(await ventanasRegistradas(idTarea)).toEqual([]);

    await correrJob(idTarea, '2026-10-18');
    expect(await correrJob(idTarea, '2026-10-19')).toEqual([
      '48h→2026-10-12',
      '24h→2026-10-12',
      '48h→2026-10-20',
      '24h→2026-10-20',
    ]);
  });

  it('reprogramar a una fecha anterior: se avisa según la fecha nueva', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const idTarea = await tareaQueVence('2026-10-12');
    expect(await correrJob(idTarea, '2026-10-10')).toEqual(['48h→2026-10-12']);

    await reprogramar(idTarea, '2026-10-11');

    // Mismo día: la tarea ahora vence mañana y recibe su aviso de 24 h.
    expect(await correrJob(idTarea, '2026-10-10')).toEqual(['48h→2026-10-12', '24h→2026-10-11']);
    expect(await ventanasRegistradas(idTarea)).toEqual([24]);
  });

  it('enviar la misma fecha no reinicia nada: no hay segundo aviso', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const idTarea = await tareaQueVence('2026-10-12');
    await correrJob(idTarea, '2026-10-10');

    await reprogramar(idTarea, '2026-10-12');

    expect(await ventanasRegistradas(idTarea)).toEqual([48]);
    expect(await correrJob(idTarea, '2026-10-10')).toEqual(['48h→2026-10-12']);
  });

  it('editar otros campos no reinicia nada', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const idTarea = await tareaQueVence('2026-10-12');
    await correrJob(idTarea, '2026-10-10');

    await tasks.update(idProyecto, idTarea, liderId, { tituloTarea: 'Título nuevo', prioridad: 'ALTA' });

    expect(await ventanasRegistradas(idTarea)).toEqual([48]);
    expect(await correrJob(idTarea, '2026-10-10')).toEqual(['48h→2026-10-12']);
  });

  it('una edición rechazada no cambia la fecha ni los avisos registrados', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const idTarea = await tareaQueVence('2026-10-12');
    await correrJob(idTarea, '2026-10-10');

    // responsableId no es líder ni participa en el rol de la tarea: no puede editarla.
    await expect(tasks.update(idProyecto, idTarea, responsableId, { fechaLimite: '2026-10-20' })).rejects.toThrow();
    // Hito inexistente: la validación de relaciones aborta la transacción.
    await expect(
      tasks.update(idProyecto, idTarea, liderId, { fechaLimite: '2026-10-20', idHito: 2_000_000_000 }),
    ).rejects.toThrow();

    const tarea = await prisma.tarea.findUniqueOrThrow({ where: { idTarea }, select: { fechaLimite: true } });
    expect(tarea.fechaLimite).toEqual(fecha('2026-10-12'));
    expect(await ventanasRegistradas(idTarea)).toEqual([48]);
  });

  it('las notificaciones ya entregadas se conservan y la fecha nueva genera las suyas', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const idTarea = await tareaQueVence('2026-10-12');
    const notifications = new NotificationsService(prisma as unknown as PrismaService, {} as NotificationsGateway);
    const service = new TasksDueReminderService(prisma as unknown as PrismaService, notifications);
    const bandeja = async () =>
      (await notifications.findUnreadForUser(responsableId))
        .filter((n) => (n.datosJson as { taskId?: number })?.taskId === idTarea)
        .map((n) => n.mensajeNotificacion)
        .sort();

    vi.setSystemTime(a8am('2026-10-10'));
    await service.enviarRecordatoriosDeVencimiento();
    await reprogramar(idTarea, '2026-10-20');
    expect(await bandeja()).toHaveLength(1);

    vi.setSystemTime(a8am('2026-10-18'));
    await service.enviarRecordatoriosDeVencimiento();
    await service.enviarRecordatoriosDeVencimiento();

    const mensajes = await bandeja();
    expect(mensajes).toHaveLength(2);
    expect(mensajes[0]).toContain('vence el 12 de octubre de 2026');
    expect(mensajes[1]).toContain('vence el 20 de octubre de 2026');
  });
});
