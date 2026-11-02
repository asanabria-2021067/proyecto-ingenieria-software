import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import {
  createIntegrationHito,
  createIntegrationParticipation,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationSprint,
  createIntegrationTask,
  createIntegrationTaskAssignment,
  createIntegrationUser,
} from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { tasksStack } from './setup/tasks-stack';
import { TasksAuthorizationService } from '../../src/tasks/tasks-authorization.service';
import { TasksContextService } from '../../src/tasks/tasks-context.service';
import { TasksExtrasService } from '../../src/tasks/tasks-extras.service';
import { PlantillasTareaService } from '../../src/tasks/plantillas-tarea.service';
import { TasksRecurrenceService } from '../../src/tasks/tasks-recurrence.service';
import { EvidenceService } from '../../src/evidence/evidence.service';
import { BitacoraEventosService } from '../../src/bitacora/bitacora-eventos.service';
import { ProjectTransactionService } from '../../src/common/project-policy/project-transaction.service';
import { ProjectReadPolicyService } from '../../src/common/project-policy/project-read-policy.service';
import { ProjectPolicyService } from '../../src/common/project-policy/project-policy.service';
import { ProjectIdResolverService } from '../../src/common/project-policy/project-id-resolver.service';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * MEJ-6/10/47/48/49/52 contra PostgreSQL real: checklist con permisos de
 * lider/asignado, bloqueo entre tareas (ciclos y paso de estado), historial
 * desde la bitacora, evidencias, plantillas y el job de tareas repetitivas.
 * Se activa solo con INTEGRATION_DATABASE_URL.
 */
describeIntegration('Tareas: checklist, bloqueo, historial, evidencias, plantillas y repeticion — PostgreSQL real', () => {
  let prisma: PrismaClient;
  let scope: IntegrationCleanupScope;
  let stack: ReturnType<typeof tasksStack>;
  let extras: TasksExtrasService;
  let plantillas: PlantillasTareaService;
  let evidence: EvidenceService;
  let recurrence: TasksRecurrenceService;

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    const prismaService = prisma as unknown as PrismaService;
    const context = new TasksContextService(prismaService);
    const authorization = new TasksAuthorizationService(context);
    const runner = new ProjectTransactionService(prismaService);
    const policy = new ProjectPolicyService(new ProjectIdResolverService(prismaService));
    stack = tasksStack(prisma);
    const readPolicy = new ProjectReadPolicyService(prismaService);
    extras = new TasksExtrasService(prismaService, runner, policy, authorization, readPolicy);
    plantillas = new PlantillasTareaService(prismaService, authorization, context, runner, policy, readPolicy);
    evidence = new EvidenceService(prismaService, runner, policy, authorization, context, readPolicy);
    recurrence = new TasksRecurrenceService(prismaService, new BitacoraEventosService());
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    scope = {};
  });

  afterEach(async () => {
    const taskIds = (await prisma.tarea.findMany({ where: { idProyecto: { in: scope.projectIds ?? [] } }, select: { idTarea: true } })).map((t) => t.idTarea);
    await prisma.evidencia.deleteMany({ where: { idTarea: { in: taskIds } } });
    await prisma.bitacoraAuditoria.deleteMany({ where: { tipoObjeto: 'TAREA', idObjeto: { in: taskIds.map(String) } } });
    scope.taskIds = taskIds;
    const asignaciones = await prisma.asignacionTarea.findMany({ where: { idTarea: { in: taskIds } }, select: { idAsignacion: true } });
    scope.assignmentIds = asignaciones.map((a) => a.idAsignacion);
    await cleanupIntegrationFixtures(prisma, scope);
  });

  async function escenario() {
    const leader = await createIntegrationUser(prisma);
    const member = await createIntegrationUser(prisma);
    const outsider = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario, member.idUsuario, outsider.idUsuario];
    const project = await createIntegrationProject(prisma, leader.idUsuario, { estadoProyecto: 'EN_PROGRESO' });
    scope.projectIds = [project.idProyecto];
    const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: 'ACTIVO' });
    scope.sprintIds = [sprint.idSprint];
    const hito = await createIntegrationHito(prisma, project.idProyecto);
    scope.hitoIds = [hito.idHito];
    const rol = await createIntegrationProjectRole(prisma, project.idProyecto);
    scope.roleIds = [rol.idRolProyecto];
    const participacion = await createIntegrationParticipation(prisma, member.idUsuario, rol.idRolProyecto, {
      estadoParticipacion: 'ACTIVO',
    });
    scope.participationIds = [participacion.idParticipacion];
    const base = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint, { tituloTarea: 'Base', idHito: hito.idHito });
    const dependiente = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint, { tituloTarea: 'Dependiente', idHito: hito.idHito });
    scope.taskIds = [base.idTarea, dependiente.idTarea];
    await createIntegrationTaskAssignment(prisma, dependiente.idTarea, member.idUsuario, leader.idUsuario, {
      idParticipacion: participacion.idParticipacion,
    });
    return { leader, member, outsider, project, sprint, hito, base, dependiente };
  }

  it('MEJ-48: no admite ciclos ni tareas de otro proyecto y bloquea el paso de estado hasta que el bloqueante este Hecho', async () => {
    const { leader, project, base, dependiente } = await escenario();

    await stack.tasks.update(project.idProyecto, dependiente.idTarea, leader.idUsuario, { idTareaBloqueante: base.idTarea });
    const detalle = await stack.tasks.findOne(project.idProyecto, dependiente.idTarea, leader.idUsuario);
    expect(detalle.bloqueadaPor).toMatchObject({ idTarea: base.idTarea, tituloTarea: 'Base' });

    // Ciclo: base bloqueada por dependiente, que ya depende de base.
    await expect(
      stack.tasks.update(project.idProyecto, base.idTarea, leader.idUsuario, { idTareaBloqueante: dependiente.idTarea }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      stack.tasks.update(project.idProyecto, base.idTarea, leader.idUsuario, { idTareaBloqueante: base.idTarea }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // No puede pasar a En progreso, ni por estado ni por accion masiva.
    await expect(
      stack.tasks.updateEstado(project.idProyecto, dependiente.idTarea, leader.idUsuario, { estadoTarea: 'EN_PROGRESO' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      stack.tasks.bulkAction(project.idProyecto, leader.idUsuario, {
        idsTareas: [dependiente.idTarea],
        accion: 'MOVER',
        estadoTarea: 'EN_PROGRESO',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect((await prisma.tarea.findUniqueOrThrow({ where: { idTarea: dependiente.idTarea } })).estadoTarea).toBe('POR_HACER');

    // Hecho el bloqueante, avanza y deja de figurar como bloqueada.
    await stack.tasks.updateEstado(project.idProyecto, base.idTarea, leader.idUsuario, { estadoTarea: 'HECHO' });
    await stack.tasks.updateEstado(project.idProyecto, dependiente.idTarea, leader.idUsuario, { estadoTarea: 'EN_PROGRESO' });
    expect((await stack.tasks.findOne(project.idProyecto, dependiente.idTarea, leader.idUsuario)).bloqueadaPor).toBeNull();

    // Quitar el bloqueo con null.
    await stack.tasks.update(project.idProyecto, dependiente.idTarea, leader.idUsuario, { idTareaBloqueante: null });
    expect((await prisma.tarea.findUniqueOrThrow({ where: { idTarea: dependiente.idTarea } })).idTareaBloqueante).toBeNull();
  });

  it('MEJ-6: lider y asignado editan el checklist, otro integrante no, y el detalle lo devuelve', async () => {
    const { leader, member, outsider, project, base, dependiente } = await escenario();

    await extras.addItem(project.idProyecto, dependiente.idTarea, leader.idUsuario, { texto: 'Disenar' });
    const lista = await extras.addItem(project.idProyecto, dependiente.idTarea, member.idUsuario, { texto: 'Probar' });
    expect(lista.map((i) => i.texto)).toEqual(['Disenar', 'Probar']);

    const actualizada = await extras.updateItem(project.idProyecto, dependiente.idTarea, lista[0].idItem, member.idUsuario, { completado: true });
    expect(actualizada[0].completado).toBe(true);

    await expect(extras.addItem(project.idProyecto, dependiente.idTarea, outsider.idUsuario, { texto: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    // El integrante asignado a OTRA tarea tampoco edita esta.
    await expect(extras.addItem(project.idProyecto, base.idTarea, member.idUsuario, { texto: 'x' })).rejects.toBeInstanceOf(ForbiddenException);

    const detalle = await stack.tasks.findOne(project.idProyecto, dependiente.idTarea, leader.idUsuario);
    expect(detalle.checklist.map((i) => [i.texto, i.completado])).toEqual([
      ['Disenar', true],
      ['Probar', false],
    ]);

    const tras = await extras.removeItem(project.idProyecto, dependiente.idTarea, lista[1].idItem, leader.idUsuario);
    expect(tras).toHaveLength(1);
  });

  it('MEJ-10: el historial muestra quien creo, movio, reasigno y cambio la fecha', async () => {
    const { leader, member, project, hito } = await escenario();
    const manana = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const pasado = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);

    const creada = await stack.tasks.create(project.idProyecto, leader.idUsuario, {
      tituloTarea: 'Con historial',
      fechaLimite: manana,
      prioridad: 'MEDIA',
      idHito: hito.idHito,
    });
    await stack.tasks.updateEstado(project.idProyecto, creada.idTarea, leader.idUsuario, { estadoTarea: 'EN_PROGRESO' });
    await stack.tasks.update(project.idProyecto, creada.idTarea, leader.idUsuario, { fechaLimite: pasado });
    await stack.tasks.assign(project.idProyecto, creada.idTarea, leader.idUsuario, { idUsuario: member.idUsuario });

    const historial = await extras.historial(project.idProyecto, creada.idTarea, member.idUsuario);
    const textos = historial.map((h) => h.descripcion);
    expect(textos).toContain('creó la tarea');
    expect(textos).toContain('movió la tarea de Por hacer a En progreso');
    expect(textos).toContain(`cambió la fecha límite de ${manana} a ${pasado}`);
    expect(textos.some((t) => t.startsWith('asignó la tarea a '))).toBe(true);
    expect(historial.every((h) => h.actor?.idUsuario === leader.idUsuario)).toBe(true);

    const ajeno = await createIntegrationUser(prisma);
    scope.userIds = [...(scope.userIds ?? []), ajeno.idUsuario];
    await expect(extras.historial(project.idProyecto, creada.idTarea, ajeno.idUsuario)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('MEJ-49: el asignado sube evidencia, un tercero no, y solo el autor o el lider la borran', async () => {
    const { leader, member, outsider, project, dependiente } = await escenario();

    const subida = await evidence.create(project.idProyecto, dependiente.idTarea, member.idUsuario, {
      tipoEvidencia: 'ENLACE',
      urlRecurso: 'https://example.com/entrega',
      descripcion: 'PR',
    });
    expect(subida).toMatchObject({ idUsuarioCargador: member.idUsuario, tipoEvidencia: 'ENLACE' });
    await expect(
      evidence.create(project.idProyecto, dependiente.idTarea, outsider.idUsuario, { tipoEvidencia: 'ENLACE', urlRecurso: 'https://example.com/x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      evidence.create(project.idProyecto, dependiente.idTarea, member.idUsuario, { tipoEvidencia: 'ENLACE', urlRecurso: 'javascript:alert(1)' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(await evidence.list(project.idProyecto, dependiente.idTarea, leader.idUsuario)).toHaveLength(1);
    await expect(evidence.remove(project.idProyecto, dependiente.idTarea, subida.idEvidencia, outsider.idUsuario)).rejects.toBeInstanceOf(ForbiddenException);
    await evidence.remove(project.idProyecto, dependiente.idTarea, subida.idEvidencia, leader.idUsuario);
    expect(await evidence.list(project.idProyecto, dependiente.idTarea, leader.idUsuario)).toHaveLength(0);
  });

  it('MEJ-52: solo el lider crea plantillas; los integrantes las ven; otro proyecto no', async () => {
    const { leader, member, outsider, project } = await escenario();

    const plantilla = await plantillas.create(project.idProyecto, leader.idUsuario, {
      nombre: 'Bug',
      tituloTarea: 'Corregir bug',
      prioridad: 'ALTA',
      tiempoEstimadoHoras: 3,
      checklist: ['Reproducir', 'Arreglar'],
    });
    await expect(
      plantillas.create(project.idProyecto, member.idUsuario, { nombre: 'x', tituloTarea: 'x', prioridad: 'BAJA' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect((await plantillas.list(project.idProyecto, member.idUsuario)).map((p) => p.nombre)).toEqual(['Bug']);
    await expect(plantillas.list(project.idProyecto, outsider.idUsuario)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(plantillas.remove(project.idProyecto, plantilla.idPlantilla, member.idUsuario)).rejects.toBeInstanceOf(ForbiddenException);
    await plantillas.remove(project.idProyecto, plantilla.idPlantilla, leader.idUsuario);
    expect(await plantillas.list(project.idProyecto, leader.idUsuario)).toEqual([]);
  });

  it('MEJ-47: el job crea una copia por ocurrencia en el sprint activo, sin duplicar y con el checklist limpio', async () => {
    const { leader, project, sprint, hito } = await escenario();
    const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

    const maestra = await stack.tasks.create(project.idProyecto, leader.idUsuario, {
      tituloTarea: 'Standup',
      fechaLimite: manana,
      prioridad: 'BAJA',
      idHito: hito.idHito,
      repeticion: 'SEMANAL',
      checklist: ['Avance', 'Bloqueos'],
    });
    expect(maestra.repeticion).toBe('SEMANAL');
    expect(maestra.repeticionProxima).toBe(new Date(Date.parse(`${manana}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10));

    const antes = new Date(Date.parse(`${manana}T12:00:00Z`));
    expect(await recurrence.generarTareasRepetitivas(antes)).toBe(0); // aun no toca

    const cuando = new Date(Date.parse(maestra.repeticionProxima as string) + 14 * 3_600_000); // ese dia, 08:00 Guatemala
    expect(await recurrence.generarTareasRepetitivas(cuando)).toBe(1);
    expect(await recurrence.generarTareasRepetitivas(cuando)).toBe(0); // idempotente

    const copias = await prisma.tarea.findMany({ where: { idTareaOrigen: maestra.idTarea }, include: { checklist: true } });
    expect(copias).toHaveLength(1);
    expect(copias[0]).toMatchObject({ idSprint: sprint.idSprint, estadoTarea: 'POR_HACER', repeticion: null, tituloTarea: 'Standup' });
    expect(copias[0].checklist.map((i) => [i.texto, i.completado])).toEqual([
      ['Avance', false],
      ['Bloqueos', false],
    ]);
    const m = await prisma.tarea.findUniqueOrThrow({ where: { idTarea: maestra.idTarea } });
    expect(m.repeticionProxima?.toISOString().slice(0, 10)).toBe(
      new Date(Date.parse(maestra.repeticionProxima as string) + 7 * 86_400_000).toISOString().slice(0, 10),
    );
  });

  it('MEJ-47: sin sprint activo no se crea la copia', async () => {
    const { leader, project, sprint, hito } = await escenario();
    const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const maestra = await stack.tasks.create(project.idProyecto, leader.idUsuario, {
      tituloTarea: 'Diaria',
      fechaLimite: manana,
      prioridad: 'BAJA',
      idHito: hito.idHito,
      repeticion: 'DIARIA',
    });
    await prisma.sprint.update({ where: { idSprint: sprint.idSprint }, data: { estado: 'CERRADO' } });
    const cuando = new Date(Date.parse(maestra.repeticionProxima as string) + 14 * 3_600_000);
    expect(await recurrence.generarTareasRepetitivas(cuando)).toBe(0);
    expect(await prisma.tarea.count({ where: { idTareaOrigen: maestra.idTarea } })).toBe(0);
  });
});
