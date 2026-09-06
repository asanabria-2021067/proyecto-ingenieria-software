import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { exitStack } from './setup/exit-flow';
import { tasksStack } from './setup/tasks-stack';
import * as fixtures from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';

async function expectStatus(status: number, fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof HttpException && error.getStatus() === status) {
      return error.getResponse();
    }
    throw new Error(
      `Se esperaba HTTP ${status} pero la operación falló con: ${
        error instanceof HttpException ? `HTTP ${error.getStatus()}` : String(error)
      }`,
    );
  }
  throw new Error(`Se esperaba HTTP ${status} pero la operación se resolvió sin error.`);
}

/**
 * C084 (06 v2 §13/§47 T10): salir del proyecto no siempre coincide con un
 * Sprint en marcha. Cuando no hay ninguno operable, retirarse NO puede
 * inventar un Sprint ni una fila de horas para tener dónde colgar el retiro:
 * lo pendiente sigue pendiente y lo decide la conciliación de §14.
 */
describeIntegration('S7 salidas entre Sprints', () => {
  let db: PrismaClient;
  let scope: IntegrationCleanupScope;
  let solicitudIds: number[];
  beforeAll(async () => { db = createIntegrationPrismaClient(); await db.$connect(); });
  beforeEach(() => { scope = {}; solicitudIds = []; });
  afterEach(async () => {
    vi.restoreAllMocks();
    await db.notificacion.deleteMany({ where: { idUsuario: { in: scope.userIds ?? [] } } });
    await db.bitacoraAuditoria.deleteMany({ where: { idUsuario: { in: scope.userIds ?? [] } } });
    await db.horasParticipacion.deleteMany({ where: { idParticipacion: { in: scope.participationIds ?? [] } } });
    if (solicitudIds.length > 0) {
      await db.solicitudSalidaProyecto.deleteMany({ where: { idSolicitud: { in: solicitudIds } } });
    }
    await cleanupIntegrationFixtures(db, scope);
  });
  afterAll(async () => { await db.$disconnect(); });

  it('T10: aprobar una salida sin Sprint operable retira sin crear horas ni Sprint', async () => {
    const leader = await fixtures.createIntegrationUser(db);
    const saliente = await fixtures.createIntegrationUser(db);
    scope.userIds = [leader.idUsuario, saliente.idUsuario];
    const project = await fixtures.createIntegrationProject(db, leader.idUsuario, { estadoProyecto: 'EN_PROGRESO' });
    scope.projectIds = [project.idProyecto];
    const role = await fixtures.createIntegrationProjectRole(db, project.idProyecto, { cupos: 3 });
    scope.roleIds = [role.idRolProyecto];
    const participacion = await fixtures.createIntegrationParticipation(db, saliente.idUsuario, role.idRolProyecto, { estadoParticipacion: 'ACTIVO' });
    scope.participationIds = [participacion.idParticipacion];

    // TODOS los Sprints del proyecto están CERRADO: no hay ninguno operable.
    const sprintCerrado = await fixtures.createIntegrationSprint(db, project.idProyecto, { estado: 'CERRADO' });
    scope.sprintIds = [sprintCerrado.idSprint];

    // Contribución histórica YA consumida.
    const tareaConsumida = await fixtures.createIntegrationTask(db, project.idProyecto, leader.idUsuario, sprintCerrado.idSprint, { estadoTarea: 'HECHO' });
    const consumida = await fixtures.createIntegrationTaskAssignment(db, tareaConsumida.idTarea, saliente.idUsuario, leader.idUsuario, {
      idParticipacion: participacion.idParticipacion,
      desasignadaEn: new Date('2026-08-20T12:00:00.000Z'),
      horasReales: '4.00',
      reconocidoEn: new Date('2026-08-21T09:00:00.000Z'),
    });
    // Contribución histórica NO consumida de ese mismo Sprint cerrado.
    const tareaPendiente = await fixtures.createIntegrationTask(db, project.idProyecto, leader.idUsuario, sprintCerrado.idSprint, { estadoTarea: 'HECHO' });
    const pendiente = await fixtures.createIntegrationTaskAssignment(db, tareaPendiente.idTarea, saliente.idUsuario, leader.idUsuario, {
      idParticipacion: participacion.idParticipacion,
      desasignadaEn: new Date('2026-08-22T12:00:00.000Z'),
      horasReales: '1.50',
    });
    scope.taskIds = [tareaConsumida.idTarea, tareaPendiente.idTarea];
    scope.assignmentIds = [consumida.idAsignacion, pendiente.idAsignacion];

    const { service } = exitStack(db);
    const solicitud = await service.createSolicitudSalida(project.idProyecto, saliente.idUsuario, 'T10: salida entre Sprints, sin Sprint operable');
    solicitudIds = [solicitud.idSolicitud];
    await service.continueExitPreparation(project.idProyecto, saliente.idUsuario);

    const sprintsAntes = await db.sprint.count({ where: { idProyecto: project.idProyecto } });
    const horasAntes = await db.horasParticipacion.count({ where: { idParticipacion: participacion.idParticipacion } });
    expect(horasAntes).toBe(0);

    const aprobada = await service.approveSolicitudSalida(project.idProyecto, solicitud.idSolicitud, leader.idUsuario);
    expect(aprobada.estadoSolicitud).toBe('APROBADA');

    const retirada = await db.participacionProyecto.findUniqueOrThrow({ where: { idParticipacion: participacion.idParticipacion } });
    expect(retirada.estadoParticipacion).toBe('RETIRADO');
    expect(retirada.fechaSalida).not.toBeNull();

    // Ni una fila de horas nueva, ni un Sprint fabricado, ni idSprint NULL.
    expect(await db.horasParticipacion.count({ where: { idParticipacion: participacion.idParticipacion } })).toBe(0);
    expect(await db.sprint.count({ where: { idProyecto: project.idProyecto } })).toBe(sprintsAntes);
    expect(await db.horasParticipacion.count({ where: { idSprint: null } })).toBe(0);

    // La contribución histórica no consumida sigue intacta, para §14.
    const siguePendiente = await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: pendiente.idAsignacion } });
    expect(siguePendiente.reconocidoEn).toBeNull();
    expect(siguePendiente.horasReales?.toFixed(2)).toBe('1.50');
    // La ya consumida conserva su marca original.
    expect((await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: consumida.idAsignacion } })).reconocidoEn?.toISOString())
      .toBe(new Date('2026-08-21T09:00:00.000Z').toISOString());

    const eventos = await db.bitacoraAuditoria.findMany({ where: { idUsuario: leader.idUsuario, accion: 'EXIT_REQUEST_APPROVED' } });
    expect(eventos).toHaveLength(1);
    const detalle = eventos[0].detalleJson as { idSprint: number | null; valorNuevo: { reconocidas: unknown[] } };
    // Sin Sprint operable, el hecho se registra con Sprint nulo y sin reconocimientos.
    expect(detalle.idSprint).toBeNull();
    expect(detalle.valorNuevo.reconocidas).toEqual([]);
    expect(await db.notificacion.count({ where: { idUsuario: saliente.idUsuario } })).toBe(1);
  });

  it('T11-A: con Sprint EN_FINALIZACION las cinco rutas de salida devuelven 409 sin escribir', async () => {
    const leader = await fixtures.createIntegrationUser(db);
    const enPreparacion = await fixtures.createIntegrationUser(db);
    const enPendiente = await fixtures.createIntegrationUser(db);
    const nuevo = await fixtures.createIntegrationUser(db);
    scope.userIds = [leader.idUsuario, enPreparacion.idUsuario, enPendiente.idUsuario, nuevo.idUsuario];
    const project = await fixtures.createIntegrationProject(db, leader.idUsuario, { estadoProyecto: 'EN_PROGRESO' });
    scope.projectIds = [project.idProyecto];
    const role = await fixtures.createIntegrationProjectRole(db, project.idProyecto, { cupos: 5 });
    scope.roleIds = [role.idRolProyecto];
    const pPreparacion = await fixtures.createIntegrationParticipation(db, enPreparacion.idUsuario, role.idRolProyecto, { estadoParticipacion: 'ACTIVO' });
    const pPendiente = await fixtures.createIntegrationParticipation(db, enPendiente.idUsuario, role.idRolProyecto, { estadoParticipacion: 'ACTIVO' });
    const pNuevo = await fixtures.createIntegrationParticipation(db, nuevo.idUsuario, role.idRolProyecto, { estadoParticipacion: 'ACTIVO' });
    scope.participationIds = [pPreparacion.idParticipacion, pPendiente.idParticipacion, pNuevo.idParticipacion];

    // Sprint ACTIVO todavía: se preparan las dos solicitudes por la vía real.
    const sprint = await fixtures.createIntegrationSprint(db, project.idProyecto, { estado: 'ACTIVO' });
    scope.sprintIds = [sprint.idSprint];
    const tarea = await fixtures.createIntegrationTask(db, project.idProyecto, leader.idUsuario, sprint.idSprint, { estadoTarea: 'HECHO' });
    scope.taskIds = [tarea.idTarea];
    const tramo = await fixtures.createIntegrationTaskAssignment(db, tarea.idTarea, enPendiente.idUsuario, leader.idUsuario, {
      idParticipacion: pPendiente.idParticipacion,
      desasignadaEn: new Date('2026-09-02T12:00:00.000Z'),
      horasReales: '3.00',
    });
    scope.assignmentIds = [tramo.idAsignacion];

    const { service } = exitStack(db);
    const enPrep = await service.createSolicitudSalida(project.idProyecto, enPreparacion.idUsuario, 'T11-A: solicitud que se queda en preparación');
    const pendiente = await service.createSolicitudSalida(project.idProyecto, enPendiente.idUsuario, 'T11-A: solicitud que espera al líder');
    solicitudIds = [enPrep.idSolicitud, pendiente.idSolicitud];
    await service.continueExitPreparation(project.idProyecto, enPendiente.idUsuario);

    // --- El Sprint entra en finalización ---
    await db.sprint.update({ where: { idSprint: sprint.idSprint }, data: { estado: 'EN_FINALIZACION' } });

    const solicitudesAntes = await db.solicitudSalidaProyecto.findMany({
      where: { idSolicitud: { in: solicitudIds } }, orderBy: { idSolicitud: 'asc' },
    });
    const participacionesAntes = await db.participacionProyecto.findMany({
      where: { idParticipacion: { in: scope.participationIds } }, orderBy: { idParticipacion: 'asc' },
    });
    const tramoAntes = await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: tramo.idAsignacion } });

    // --- Las CINCO rutas rechazan con 409 ---
    const operaciones: Array<[string, () => Promise<unknown>]> = [
      ['crear', () => service.createSolicitudSalida(project.idProyecto, nuevo.idUsuario, 'T11-A: intento de crear durante la finalización')],
      ['continuar', () => service.continueExitPreparation(project.idProyecto, enPreparacion.idUsuario)],
      ['cancelar', () => service.cancelExitPreparation(project.idProyecto, enPreparacion.idUsuario)],
      ['aprobar', () => service.approveSolicitudSalida(project.idProyecto, pendiente.idSolicitud, leader.idUsuario)],
      ['rechazar', () => service.rejectSolicitudSalida(project.idProyecto, pendiente.idSolicitud, leader.idUsuario)],
    ];
    for (const [nombre, operacion] of operaciones) {
      const cuerpo = await expectStatus(409, operacion);
      const mensaje = typeof cuerpo === 'string' ? cuerpo : (cuerpo as { message?: string }).message;
      expect(mensaje, `rechazo de «${nombre}»`).toContain('finalización');
    }

    // --- Cero escrituras: el estado es idéntico al del snapshot ---
    expect(await db.solicitudSalidaProyecto.findMany({ where: { idSolicitud: { in: solicitudIds } }, orderBy: { idSolicitud: 'asc' } })).toEqual(solicitudesAntes);
    expect(await db.participacionProyecto.findMany({ where: { idParticipacion: { in: scope.participationIds } }, orderBy: { idParticipacion: 'asc' } })).toEqual(participacionesAntes);
    expect(await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: tramo.idAsignacion } })).toEqual(tramoAntes);
    expect(tramoAntes.reconocidoEn).toBeNull();
    expect(await db.horasParticipacion.count({ where: { idParticipacion: { in: scope.participationIds } } })).toBe(0);
    expect(await db.solicitudSalidaProyecto.count({ where: { idUsuario: nuevo.idUsuario } })).toBe(0);

    // --- Con el Sprint de vuelta en ACTIVO, el rechazo ordinario funciona ---
    await db.sprint.update({ where: { idSprint: sprint.idSprint }, data: { estado: 'ACTIVO' } });
    const rechazada = await service.rejectSolicitudSalida(project.idProyecto, pendiente.idSolicitud, leader.idUsuario);
    expect(rechazada.estadoSolicitud).toBe('RECHAZADA');
    expect(await db.bitacoraAuditoria.count({ where: { idUsuario: leader.idUsuario, accion: 'EXIT_REQUEST_REJECTED' } })).toBe(1);
    // Rechazar conserva la participación y no toca las horas.
    expect((await db.participacionProyecto.findUniqueOrThrow({ where: { idParticipacion: pPendiente.idParticipacion } })).estadoParticipacion).toBe('ACTIVO');
    expect(await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: tramo.idAsignacion } })).toEqual(tramoAntes);
    expect(await db.horasParticipacion.count({ where: { idParticipacion: { in: scope.participationIds } } })).toBe(0);
  });

  it('T11-B: una salida abierta excluye al destinatario de nuevas asignaciones sin impedir que el saliente entregue su trabajo', async () => {
    const leader = await fixtures.createIntegrationUser(db);
    const usuarioA = await fixtures.createIntegrationUser(db);
    const usuarioB = await fixtures.createIntegrationUser(db);
    const usuarioC = await fixtures.createIntegrationUser(db);
    scope.userIds = [leader.idUsuario, usuarioA.idUsuario, usuarioB.idUsuario, usuarioC.idUsuario];
    const project = await fixtures.createIntegrationProject(db, leader.idUsuario, { estadoProyecto: 'EN_PROGRESO' });
    scope.projectIds = [project.idProyecto];
    const role = await fixtures.createIntegrationProjectRole(db, project.idProyecto, { cupos: 5 });
    const otroRol = await fixtures.createIntegrationProjectRole(db, project.idProyecto, { cupos: 5 });
    scope.roleIds = [role.idRolProyecto, otroRol.idRolProyecto];
    const pA = await fixtures.createIntegrationParticipation(db, usuarioA.idUsuario, role.idRolProyecto, { estadoParticipacion: 'ACTIVO' });
    const pB = await fixtures.createIntegrationParticipation(db, usuarioB.idUsuario, role.idRolProyecto, { estadoParticipacion: 'ACTIVO' });
    const pC = await fixtures.createIntegrationParticipation(db, usuarioC.idUsuario, role.idRolProyecto, { estadoParticipacion: 'ACTIVO' });
    scope.participationIds = [pA.idParticipacion, pB.idParticipacion, pC.idParticipacion];
    const sprint = await fixtures.createIntegrationSprint(db, project.idProyecto, { estado: 'ACTIVO' });
    scope.sprintIds = [sprint.idSprint];

    const { service: exit } = exitStack(db);
    const { tasks, roles, eligibility } = tasksStack(db);

    // A tiene su tarea con horas; después abre su salida (PREPARACION).
    const tareaDeA = await fixtures.createIntegrationTask(db, project.idProyecto, leader.idUsuario, sprint.idSprint, { idRolProyecto: role.idRolProyecto });
    scope.taskIds = [tareaDeA.idTarea];
    await tasks.assign(project.idProyecto, tareaDeA.idTarea, leader.idUsuario, { idUsuario: usuarioA.idUsuario });
    const tramoDeA = await db.asignacionTarea.findFirstOrThrow({ where: { idTarea: tareaDeA.idTarea, desasignadaEn: null } });
    scope.assignmentIds = [tramoDeA.idAsignacion];
    expect(tramoDeA.idParticipacion).toBe(pA.idParticipacion);

    const salidaA = await exit.createSolicitudSalida(project.idProyecto, usuarioA.idUsuario, 'T11-B: A entra en preparación de salida');
    const salidaB = await exit.createSolicitudSalida(project.idProyecto, usuarioB.idUsuario, 'T11-B: B espera resolución del líder');
    solicitudIds = [salidaA.idSolicitud, salidaB.idSolicitud];
    await exit.continueExitPreparation(project.idProyecto, usuarioB.idUsuario);

    // --- Nuevas asignaciones a A y a B: rechazadas con su motivo ---
    const nueva = await fixtures.createIntegrationTask(db, project.idProyecto, leader.idUsuario, sprint.idSprint, { idRolProyecto: role.idRolProyecto });
    scope.taskIds = [...scope.taskIds, nueva.idTarea];
    for (const destino of [usuarioA.idUsuario, usuarioB.idUsuario]) {
      const cuerpo = await expectStatus(409, () =>
        tasks.assign(project.idProyecto, nueva.idTarea, leader.idUsuario, { idUsuario: destino }),
      );
      expect(cuerpo).toMatchObject({ code: 'DESTINO_INELEGIBLE' });
      expect((cuerpo as { motivos: string[] }).motivos).toContain('SALIDA_EN_CURSO');
    }
    expect(await db.asignacionTarea.count({ where: { idTarea: nueva.idTarea } })).toBe(0);

    // --- C sí puede recibirla, con la FK de participación correcta ---
    await tasks.assign(project.idProyecto, nueva.idTarea, leader.idUsuario, { idUsuario: usuarioC.idUsuario });
    const tramoDeC = await db.asignacionTarea.findFirstOrThrow({ where: { idTarea: nueva.idTarea, desasignadaEn: null } });
    scope.assignmentIds = [...scope.assignmentIds, tramoDeC.idAsignacion];
    expect(tramoDeC.idParticipacion).toBe(pC.idParticipacion);

    // --- A SÍ puede reportar, cerrar y entregar su trabajo durante PREPARACION ---
    await db.registroTiempoTarea.create({
      data: { idAsignacion: tramoDeA.idAsignacion, idUsuario: usuarioA.idUsuario, horas: '2.50', fecha: new Date('2026-09-05') },
    });
    await tasks.assign(project.idProyecto, tareaDeA.idTarea, usuarioA.idUsuario, { idUsuario: usuarioC.idUsuario });
    const tramoCerradoDeA = await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: tramoDeA.idAsignacion } });
    expect(tramoCerradoDeA.desasignadaEn).not.toBeNull();
    // El reporte de A queda materializado por el writer único al cerrarse.
    expect(tramoCerradoDeA.horasReales?.toFixed(2)).toBe('2.50');
    const sucesorDeA = await db.asignacionTarea.findFirstOrThrow({ where: { idTarea: tareaDeA.idTarea, desasignadaEn: null } });
    scope.assignmentIds = [...scope.assignmentIds, sucesorDeA.idAsignacion];
    expect(sucesorDeA.idUsuario).toBe(usuarioC.idUsuario);

    // --- A no abre ninguna vía nueva de participación con su salida abierta ---
    // La autoasignación es del líder (403 para A), y además la elegibilidad la
    // rechazaría por sí sola: §18.1 no depende de qué ruta se intente.
    await expectStatus(403, () =>
      roles.selfAssign(project.idProyecto, otroRol.idRolProyecto, usuarioA.idUsuario),
    );
    const veredicto = await db.$transaction((tx) =>
      eligibility.evaluateSelfAssignRole(tx, {
        projectId: project.idProyecto, roleId: otroRol.idRolProyecto, userId: usuarioA.idUsuario,
      }),
    );
    expect(veredicto.elegible).toBe(false);
    expect(veredicto.motivos).toContain('SALIDA_EN_CURSO');
    expect(await db.participacionProyecto.count({ where: { idUsuario: usuarioA.idUsuario, idRolProyecto: otroRol.idRolProyecto } })).toBe(0);

    // --- Crear una tarea con asignación inicial a B se rechaza sin crearla ---
    const tareasAntes = await db.tarea.count({ where: { idProyecto: project.idProyecto } });
    await expectStatus(409, () =>
      tasks.create(project.idProyecto, leader.idUsuario, {
        tituloTarea: 'T11-B: tarea que no debe existir',
        idRolProyecto: role.idRolProyecto,
        idUsuarioAsignado: usuarioB.idUsuario,
      }),
    );
    expect(await db.tarea.count({ where: { idProyecto: project.idProyecto } })).toBe(tareasAntes);

    // --- Una tarea sin sucesor queda sin asignación activa y admite HECHO ---
    const huerfana = await fixtures.createIntegrationTask(db, project.idProyecto, leader.idUsuario, sprint.idSprint, { idRolProyecto: role.idRolProyecto });
    scope.taskIds = [...scope.taskIds, huerfana.idTarea];
    const tramoHuerfano = await fixtures.createIntegrationTaskAssignment(db, huerfana.idTarea, usuarioA.idUsuario, leader.idUsuario, {
      idParticipacion: pA.idParticipacion,
      desasignadaEn: new Date('2026-09-06T10:00:00.000Z'),
      horasReales: '1.00',
    });
    scope.assignmentIds = [...scope.assignmentIds, tramoHuerfano.idAsignacion];
    expect(await db.asignacionTarea.count({ where: { idTarea: huerfana.idTarea, desasignadaEn: null } })).toBe(0);
    // HECHO se apoya en la asignación HISTÓRICA, no en una activa.
    await db.tarea.update({ where: { idTarea: huerfana.idTarea }, data: { estadoTarea: 'HECHO' } });
    expect((await db.tarea.findUniqueOrThrow({ where: { idTarea: huerfana.idTarea } })).estadoTarea).toBe('HECHO');
    expect(await db.asignacionTarea.count({ where: { idTarea: huerfana.idTarea } })).toBe(1);
  });
});
