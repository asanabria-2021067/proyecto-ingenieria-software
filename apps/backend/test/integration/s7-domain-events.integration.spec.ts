import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { useSecondClient } from './setup/concurrency';
import { backWithEntries, cleanupFlowAFixture, closedTask, flowAFixture, flowAStack } from './setup/flow-a';
import type { IntegrationCleanupScope } from './setup/cleanup';

/**
 * C081 (06 v2 §16/§44/§47 T37): el modelo de efectos de Sprint 7 se apoya en
 * una sola regla — las filas se escriben DENTRO de la transacción y los
 * sockets se publican DESPUÉS del commit. Esta suite la fija por los dos
 * lados: un rollback no puede dejar rastro, y un commit válido no puede
 * emitir antes de tiempo.
 */
describeIntegration('S7 efectos de dominio — buffer y post-commit', () => {
  let db: PrismaClient;
  let scope: IntegrationCleanupScope;
  const second = useSecondClient();
  beforeAll(async () => { db = createIntegrationPrismaClient(); await db.$connect(); });
  beforeEach(() => { scope = {}; });
  afterEach(async () => { vi.restoreAllMocks(); await cleanupFlowAFixture(db, scope); });
  afterAll(async () => { await db.$disconnect(); });

  it('T37: un fallo posterior a persistir la notificación deja cero filas y cero emisiones, y el commit válido emite después', async () => {
    const f = await flowAFixture(db, scope, 'EN_FINALIZACION');
    const stack = flowAStack(db);
    const baseTask = { projectId: f.project.idProyecto, sprintId: f.sprint.idSprint, leaderId: f.leader.idUsuario };
    const tramo = await closedTask(db, scope, {
      ...baseTask, userId: f.memberA.idUsuario, participationId: f.participationA.idParticipacion, horasReales: '4.00',
    });
    await backWithEntries(db, { assignmentId: tramo.assignment.idAsignacion, userId: f.memberA.idUsuario, horas: '4.00' });

    // --- 1. Fallo inyectado DESPUÉS de escribir las filas de notificación ---
    const fallo = new Error('fallo determinista posterior a la notificación');
    const persistReal = stack.notifications.persistTemplateTx.bind(stack.notifications);
    const espiaPersist = vi
      .spyOn(stack.notifications, 'persistTemplateTx')
      .mockImplementation(async (...args) => {
        const resultado = await persistReal(...args);
        // Las filas YA existen dentro de la transacción en este punto.
        expect(resultado.count).toBe(1);
        throw fallo;
      });

    await expect(
      stack.service.closeSprint(f.project.idProyecto, f.sprint.idSprint, f.leader.idUsuario),
    ).rejects.toBe(fallo);
    expect(espiaPersist).toHaveBeenCalledTimes(1);

    // El rollback no deja NADA: ni notificación, ni evento, ni marca, ni socket.
    expect(await db.notificacion.count({ where: { idUsuario: { in: scope.userIds } } })).toBe(0);
    expect(await db.bitacoraAuditoria.count({ where: { idUsuario: f.leader.idUsuario } })).toBe(0);
    expect(await db.horasParticipacion.count({ where: { idSprint: f.sprint.idSprint } })).toBe(0);
    expect((await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: tramo.assignment.idAsignacion } })).reconocidoEn).toBeNull();
    expect((await db.sprint.findUniqueOrThrow({ where: { idSprint: f.sprint.idSprint } })).estado).toBe('EN_FINALIZACION');
    expect(stack.notifyClosed).not.toHaveBeenCalled();

    // --- 2. Cierre válido: la emisión ocurre estrictamente post-commit ---
    espiaPersist.mockRestore();
    let estadoVistoAlEmitir: string | undefined;
    stack.notifyClosed.mockImplementation(async () => {
      // Una conexión INDEPENDIENTE solo ve estado confirmado: si al emitir ya
      // observa CERRADO, el commit ocurrió antes que la emisión.
      const fila = await second().sprint.findUniqueOrThrow({ where: { idSprint: f.sprint.idSprint } });
      estadoVistoAlEmitir = fila.estado;
    });

    await stack.service.closeSprint(f.project.idProyecto, f.sprint.idSprint, f.leader.idUsuario);

    expect(stack.notifyClosed).toHaveBeenCalledTimes(1);
    expect(estadoVistoAlEmitir).toBe('CERRADO');
    expect(await db.notificacion.count({ where: { idUsuario: { in: scope.userIds }, tipoNotificacion: 'HORAS_CONSOLIDADAS' } })).toBe(1);
    expect(await db.bitacoraAuditoria.count({ where: { idUsuario: f.leader.idUsuario, accion: 'SPRINT_CLOSED' } })).toBe(1);
    expect(await db.bitacoraAuditoria.count({ where: { idUsuario: f.leader.idUsuario, accion: 'SPRINT_HOURS_CONSOLIDATED' } })).toBe(1);
    expect((await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: tramo.assignment.idAsignacion } })).reconocidoEn).not.toBeNull();
  });
});
