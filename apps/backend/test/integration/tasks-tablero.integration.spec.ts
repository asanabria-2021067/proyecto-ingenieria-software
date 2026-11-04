import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
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
import { TareaEnlacesService } from '../../src/tasks/tarea-enlaces.service';
import { ComentariosService } from '../../src/comentarios/comentarios.service';
import { LinkPreviewService } from '../../src/chat/link-preview/link-preview.service';
import { ProjectTransactionService } from '../../src/common/project-policy/project-transaction.service';
import { ProjectReadPolicyService } from '../../src/common/project-policy/project-read-policy.service';
import { ProjectPolicyService } from '../../src/common/project-policy/project-policy.service';
import { ProjectIdResolverService } from '../../src/common/project-policy/project-id-resolver.service';
import { EMOJIS_REACCION } from '../../src/chat/dto/toggle-reaction.dto';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { ProjectCloseReadinessService } from '../../src/project-closure/project-close-readiness.service';
import { SprintsAuthorizationService } from '../../src/sprints/sprints-authorization.service';
import { SprintsContextService } from '../../src/sprints/sprints-context.service';
import { SprintsService } from '../../src/sprints/sprints.service';

/**
 * MEJ-106/107/109/110/112 contra PostgreSQL real: subtareas de un nivel,
 * enlaces con proteccion SSRF, responsables adicionales, hilos y reacciones
 * de comentarios, y filtros/orden del listado. Permisos: un no miembro nunca
 * opera sobre las tareas del proyecto. Se activa solo con INTEGRATION_DATABASE_URL.
 */
describeIntegration('Tareas: subtareas, enlaces, responsables, hilos y filtros — PostgreSQL real', () => {
  let prisma: PrismaClient;
  let scope: IntegrationCleanupScope;
  let stack: ReturnType<typeof tasksStack>;
  let enlaces: TareaEnlacesService;
  let comentarios: ComentariosService;

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    const prismaService = prisma as unknown as PrismaService;
    const context = new TasksContextService(prismaService);
    const authorization = new TasksAuthorizationService(context);
    const runner = new ProjectTransactionService(prismaService);
    const policy = new ProjectPolicyService(new ProjectIdResolverService(prismaService));
    const readPolicy = new ProjectReadPolicyService(prismaService);
    stack = tasksStack(prisma);
    const preview = new LinkPreviewService({ get: async () => undefined, set: async () => undefined } as never);
    // Sin red real: un dominio publico "resuelve" a una IP publica; los literales internos se bloquean antes.
    preview.resolver = async () => [{ address: '93.184.216.34', family: 4 }];
    preview.transport = vi.fn(async () => {
      throw new Error('sin red en pruebas');
    });
    enlaces = new TareaEnlacesService(prismaService, runner, policy, authorization, readPolicy, preview);
    comentarios = new ComentariosService(prismaService, stack.notifications, runner, policy, readPolicy);
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
    await prisma.comentario.deleteMany({ where: { idTarea: { in: taskIds } } });
    await prisma.bitacoraAuditoria.deleteMany({ where: { tipoObjeto: 'TAREA', idObjeto: { in: taskIds.map(String) } } });
    scope.taskIds = taskIds;
    const asignaciones = await prisma.asignacionTarea.findMany({ where: { idTarea: { in: taskIds } }, select: { idAsignacion: true } });
    scope.assignmentIds = asignaciones.map((a) => a.idAsignacion);
    await cleanupIntegrationFixtures(prisma, scope);
  });

  async function escenario() {
    const leader = await createIntegrationUser(prisma);
    const member = await createIntegrationUser(prisma);
    const colega = await createIntegrationUser(prisma);
    const outsider = await createIntegrationUser(prisma);
    scope.userIds = [leader.idUsuario, member.idUsuario, colega.idUsuario, outsider.idUsuario];
    const project = await createIntegrationProject(prisma, leader.idUsuario, { estadoProyecto: 'EN_PROGRESO' });
    scope.projectIds = [project.idProyecto];
    const sprint = await createIntegrationSprint(prisma, project.idProyecto, { estado: 'ACTIVO' });
    scope.sprintIds = [sprint.idSprint];
    const hito = await createIntegrationHito(prisma, project.idProyecto);
    scope.hitoIds = [hito.idHito];
    const rol = await createIntegrationProjectRole(prisma, project.idProyecto, { cupos: 3 });
    scope.roleIds = [rol.idRolProyecto];
    const pMember = await createIntegrationParticipation(prisma, member.idUsuario, rol.idRolProyecto, { estadoParticipacion: 'ACTIVO' });
    const pColega = await createIntegrationParticipation(prisma, colega.idUsuario, rol.idRolProyecto, { estadoParticipacion: 'ACTIVO' });
    // El lider tambien es participante activo: comentar y reaccionar exigen participacion activa (assertChannelAWriteAllowed).
    const pLeader = await createIntegrationParticipation(prisma, leader.idUsuario, rol.idRolProyecto, { estadoParticipacion: 'ACTIVO' });
    scope.participationIds = [pMember.idParticipacion, pColega.idParticipacion, pLeader.idParticipacion];
    const padre = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint, { tituloTarea: 'Padre' });
    const otra = await createIntegrationTask(prisma, project.idProyecto, leader.idUsuario, sprint.idSprint, { tituloTarea: 'Otra' });
    scope.taskIds = [padre.idTarea, otra.idTarea];
    await prisma.tarea.updateMany({ where: { idTarea: { in: scope.taskIds } }, data: { idHito: hito.idHito } });
    await createIntegrationTaskAssignment(prisma, padre.idTarea, member.idUsuario, leader.idUsuario, { idParticipacion: pMember.idParticipacion });
    return { leader, member, colega, outsider, project, sprint, hito, padre, otra };
  }

  const dtoHija = (idHito: number, idTareaPadre: number) => ({
    tituloTarea: 'Hija',
    fechaLimite: '2999-01-01',
    prioridad: 'MEDIA' as const,
    idHito,
    idTareaPadre,
  });

  it('MEJ-106: la hija tiene su propia fila, no admite nietas y el padre con hijas no se borra', async () => {
    const { leader, project, hito, padre } = await escenario();

    const hija = await stack.tasks.create(project.idProyecto, leader.idUsuario, dtoHija(hito.idHito, padre.idTarea));
    expect(hija.idTareaPadre).toBe(padre.idTarea);

    await expect(
      stack.tasks.create(project.idProyecto, leader.idUsuario, dtoHija(hito.idHito, hija.idTarea)),
    ).rejects.toBeInstanceOf(BadRequestException);

    const detalle = await stack.tasks.findOne(project.idProyecto, padre.idTarea, leader.idUsuario);
    expect(detalle.subtareas).toEqual({ hechas: 0, total: 1 });
    await stack.tasks.updateEstado(project.idProyecto, hija.idTarea, leader.idUsuario, { estadoTarea: 'HECHO' });
    expect((await stack.tasks.findOne(project.idProyecto, padre.idTarea, leader.idUsuario)).subtareas).toEqual({ hechas: 1, total: 1 });

    await expect(stack.tasks.remove(project.idProyecto, padre.idTarea, leader.idUsuario)).rejects.toBeInstanceOf(ConflictException);
    await stack.tasks.remove(project.idProyecto, hija.idTarea, leader.idUsuario);
    await stack.tasks.remove(project.idProyecto, padre.idTarea, leader.idUsuario);
  });

  it('MEJ-106: un padre de otro proyecto o inexistente se rechaza', async () => {
    const { leader, project, hito } = await escenario();
    await expect(
      stack.tasks.create(project.idProyecto, leader.idUsuario, dtoHija(hito.idHito, 2_000_000_000)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('MEJ-109: lider reemplaza los responsables adicionales; ellos operan y un no miembro no', async () => {
    const { leader, member, colega, outsider, project, padre } = await escenario();

    const tarea = await stack.tasks.setResponsables(project.idProyecto, padre.idTarea, leader.idUsuario, { idsUsuarios: [colega.idUsuario, member.idUsuario] });
    expect(tarea.responsables.map((r) => r.idUsuario)).toEqual([member.idUsuario, colega.idUsuario]);

    // El adicional cambia el estado igual que el principal.
    await stack.tasks.updateEstado(project.idProyecto, padre.idTarea, colega.idUsuario, { estadoTarea: 'EN_PROGRESO' });

    // Cada uno registra sus propias horas en el tramo activo.
    await stack.timeRecords.create(project.idProyecto, padre.idTarea, colega.idUsuario, { horas: 2, fecha: new Date().toISOString().slice(0, 10) });
    const registro = await prisma.registroTiempoTarea.findFirstOrThrow({ where: { idUsuario: colega.idUsuario } });
    expect(registro.idUsuario).toBe(colega.idUsuario);

    // Un no miembro: 403 al cambiar responsables y no puede operar.
    await expect(
      stack.tasks.setResponsables(project.idProyecto, padre.idTarea, outsider.idUsuario, { idsUsuarios: [outsider.idUsuario] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      stack.tasks.updateEstado(project.idProyecto, padre.idTarea, outsider.idUsuario, { estadoTarea: 'HECHO' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      stack.timeRecords.create(project.idProyecto, padre.idTarea, outsider.idUsuario, { horas: 1, fecha: new Date().toISOString().slice(0, 10) }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Un usuario sin participacion no se puede agregar como responsable (el servicio responde 409).
    await expect(
      stack.tasks.setResponsables(project.idProyecto, padre.idTarea, leader.idUsuario, { idsUsuarios: [outsider.idUsuario] }),
    ).rejects.toBeInstanceOf(ConflictException);

    const vacia = await stack.tasks.setResponsables(project.idProyecto, padre.idTarea, leader.idUsuario, { idsUsuarios: [] });
    expect(vacia.responsables.map((r) => r.idUsuario)).toEqual([member.idUsuario]);
  });

  it('MEJ-109: las horas de un adicional no descuadran la cache: el sprint y el proyecto se pueden cerrar', async () => {
    const { leader, member, colega, project, sprint, padre } = await escenario();
    await stack.tasks.setResponsables(project.idProyecto, padre.idTarea, leader.idUsuario, { idsUsuarios: [colega.idUsuario] });
    const hoy = new Date().toISOString().slice(0, 10);
    await stack.timeRecords.create(project.idProyecto, padre.idTarea, member.idUsuario, { horas: 3, fecha: hoy });
    await stack.timeRecords.create(project.idProyecto, padre.idTarea, colega.idUsuario, { horas: 2, fecha: hoy });

    // La cache del tramo acredita solo al titular; el adicional queda en su propio registro.
    const tramo = await prisma.asignacionTarea.findFirstOrThrow({ where: { idTarea: padre.idTarea } });
    expect(tramo.horasReales?.toString()).toBe('3');
    expect(await prisma.registroTiempoTarea.count({ where: { idAsignacion: tramo.idAsignacion } })).toBe(2);

    // El tramo se cierra (F2) y el sprint pasa F3/F4 sin SPRINT_F4_CACHE_DESCUADRADA.
    await prisma.asignacionTarea.update({ where: { idAsignacion: tramo.idAsignacion }, data: { desasignadaEn: new Date() } });
    const prismaService = prisma as unknown as PrismaService;
    const sprints = new SprintsService(
      prismaService,
      new SprintsContextService(prismaService),
      new SprintsAuthorizationService(new SprintsContextService(prismaService)),
      stack.notifications,
      new ProjectTransactionService(prismaService),
      new ProjectPolicyService(new ProjectIdResolverService(prismaService)),
      new ProjectReadPolicyService(prismaService),
    );
    const predicados = await prisma.$transaction((tx) =>
      (sprints as unknown as { assertFinalizationPredicatesTx: (t: unknown, p: number, s: number) => Promise<{ f4: number }> })
        .assertFinalizationPredicatesTx(tx, project.idProyecto, sprint.idSprint),
    );
    expect(predicados.f4).toBe(1);

    // El cierre de proyecto no reporta HORAS_INCONSISTENTES por las horas del adicional.
    const resumen = await new ProjectCloseReadinessService(prismaService).evaluate(undefined, project.idProyecto, { phase: 'REQUEST' });
    expect(resumen.blockers.map((b) => b.code)).not.toContain('HORAS_INCONSISTENTES');
  });

  it('MEJ-109: un adicional que deja el proyecto pierde los permisos sobre la tarea', async () => {
    const { leader, colega, project, padre } = await escenario();
    await stack.tasks.setResponsables(project.idProyecto, padre.idTarea, leader.idUsuario, { idsUsuarios: [colega.idUsuario] });
    await stack.tasks.updateEstado(project.idProyecto, padre.idTarea, colega.idUsuario, { estadoTarea: 'EN_PROGRESO' });

    await prisma.participacionProyecto.updateMany({
      where: { idUsuario: colega.idUsuario, rolProyecto: { idProyecto: project.idProyecto } },
      data: { estadoParticipacion: 'RETIRADO' },
    });

    await expect(
      stack.tasks.updateEstado(project.idProyecto, padre.idTarea, colega.idUsuario, { estadoTarea: 'EN_REVISION' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      stack.timeRecords.create(project.idProyecto, padre.idTarea, colega.idUsuario, { horas: 1, fecha: new Date().toISOString().slice(0, 10) }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('MEJ-107: enlaces https con tope; http y hosts internos (SSRF) bloqueados; no miembro 403', async () => {
    const { leader, member, outsider, project, padre } = await escenario();

    const enlace = await enlaces.add(project.idProyecto, padre.idTarea, member.idUsuario, { url: 'https://github.com/org/repo' });
    expect(enlace).toMatchObject({ tipo: 'GITHUB', sitio: 'github.com' });
    expect(await enlaces.list(project.idProyecto, padre.idTarea, leader.idUsuario)).toHaveLength(1);
    await expect(enlaces.add(project.idProyecto, padre.idTarea, member.idUsuario, { url: 'https://github.com/org/repo' })).rejects.toBeInstanceOf(ConflictException);

    for (const url of ['http://github.com/', 'https://127.0.0.1/', 'https://169.254.169.254/latest/meta-data/', 'https://[::1]/', 'https://10.1.2.3:443/']) {
      await expect(enlaces.add(project.idProyecto, padre.idTarea, leader.idUsuario, { url })).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(enlaces.add(project.idProyecto, padre.idTarea, outsider.idUsuario, { url: 'https://github.com/otro' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(enlaces.list(project.idProyecto, padre.idTarea, outsider.idUsuario)).rejects.toBeInstanceOf(ForbiddenException);

    for (let i = 0; i < 9; i++) {
      await enlaces.add(project.idProyecto, padre.idTarea, leader.idUsuario, { url: `https://github.com/org/repo${i}` });
    }
    await expect(enlaces.add(project.idProyecto, padre.idTarea, leader.idUsuario, { url: 'https://github.com/extra' })).rejects.toBeInstanceOf(ConflictException);

    await enlaces.remove(project.idProyecto, padre.idTarea, enlace.idEnlace, leader.idUsuario);
    expect(await prisma.tareaEnlace.count({ where: { idTarea: padre.idTarea } })).toBe(9);
  });

  it('MEJ-110: respuestas de un nivel y reacciones unicas por usuario+emoji; no miembro 403', async () => {
    const { leader, member, outsider, project, padre } = await escenario();

    const raiz = await comentarios.createForTask(project.idProyecto, padre.idTarea, leader.idUsuario, 'Revisen esto');
    const respuesta = await comentarios.createForTask(project.idProyecto, padre.idTarea, member.idUsuario, 'Listo', raiz.idComentario);
    expect(respuesta.idComentarioPadre).toBe(raiz.idComentario);
    await expect(
      comentarios.createForTask(project.idProyecto, padre.idTarea, leader.idUsuario, 'nieta', respuesta.idComentario),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      comentarios.createForTask(project.idProyecto, padre.idTarea, outsider.idUsuario, 'intruso', raiz.idComentario),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const pulgar = EMOJIS_REACCION[0];
    expect(await comentarios.toggleReaccionForTask(project.idProyecto, padre.idTarea, raiz.idComentario, member.idUsuario, pulgar)).toEqual([
      { emoji: pulgar, count: 1, idsUsuarios: [member.idUsuario] },
    ]);
    // La base impide duplicados aunque se salte el servicio.
    await expect(
      prisma.reaccionComentario.create({ data: { idComentario: raiz.idComentario, idUsuario: member.idUsuario, emoji: pulgar } }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      comentarios.toggleReaccionForTask(project.idProyecto, padre.idTarea, raiz.idComentario, outsider.idUsuario, pulgar),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(await comentarios.toggleReaccionForTask(project.idProyecto, padre.idTarea, raiz.idComentario, member.idUsuario, pulgar)).toEqual([]);

    const lista = await comentarios.findByTareaEnProyecto(project.idProyecto, padre.idTarea, leader.idUsuario);
    expect(lista.find((c) => c.idComentario === respuesta.idComentario)?.idComentarioPadre).toBe(raiz.idComentario);
  });

  it('MEJ-112: el listado filtra por responsable (incluye adicionales) y rol, combina filtros y ordena por columna', async () => {
    const { leader, member, colega, project, hito, padre, otra } = await escenario();
    await stack.tasks.setResponsables(project.idProyecto, padre.idTarea, leader.idUsuario, { idsUsuarios: [colega.idUsuario] });
    await stack.tasks.updateEstado(project.idProyecto, otra.idTarea, leader.idUsuario, { estadoTarea: 'EN_PROGRESO' });

    const ids = (tareas: { idTarea: number }[]) => tareas.map((t) => t.idTarea);

    expect(ids(await stack.tasks.findAll(project.idProyecto, leader.idUsuario, { idUsuario: colega.idUsuario }))).toEqual([padre.idTarea]);
    expect(ids(await stack.tasks.findAll(project.idProyecto, leader.idUsuario, { idUsuario: member.idUsuario }))).toEqual([padre.idTarea]);
    const rol = await prisma.rolProyecto.findFirstOrThrow({ where: { idProyecto: project.idProyecto } });
    expect(ids(await stack.tasks.findAll(project.idProyecto, leader.idUsuario, { idRolProyecto: rol.idRolProyecto }))).toEqual([padre.idTarea]);
    expect(ids(await stack.tasks.findAll(project.idProyecto, leader.idUsuario, { idRolProyecto: rol.idRolProyecto, estado: 'EN_PROGRESO' }))).toEqual([]);
    expect(ids(await stack.tasks.findAll(project.idProyecto, leader.idUsuario, { idHito: hito.idHito, estado: 'EN_PROGRESO' }))).toEqual([otra.idTarea]);

    const porTitulo = await stack.tasks.findAll(project.idProyecto, leader.idUsuario, { ordenarPor: 'titulo', direccion: 'desc' });
    expect(porTitulo.map((t) => t.tituloTarea)).toEqual(['Padre', 'Otra']);
    const porResponsable = await stack.tasks.findAll(project.idProyecto, leader.idUsuario, { ordenarPor: 'responsable', direccion: 'asc' });
    expect(ids(porResponsable)).toEqual([padre.idTarea, otra.idTarea]);
  });
});
