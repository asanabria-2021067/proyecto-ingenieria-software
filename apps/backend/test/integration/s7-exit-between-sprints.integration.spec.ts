import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { exitStack } from './setup/exit-flow';
import * as fixtures from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';

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
});
