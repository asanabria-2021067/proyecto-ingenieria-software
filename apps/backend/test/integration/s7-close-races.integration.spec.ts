import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import {
  cleanupClosureLifecycle,
  closureLifecycleStack,
  proyectoConIncumplimientos,
} from './setup/closure-lifecycle';
import type { ClosureCleanupScope } from './setup/closure-storage';

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
 * C129+ (06 v2 §21/§22/§24/§47 T12-T13): preparación del cierre y sus
 * carreras. Cerrar un proyecto es un acto administrativo con precondiciones
 * verificables: quien no puede cerrarlo merece saber TODO lo que falta.
 */
describeIntegration('S7 carreras y preparación del cierre', () => {
  let db: PrismaClient;
  let scope: ClosureCleanupScope;

  beforeAll(async () => {
    db = createIntegrationPrismaClient();
    await db.$connect();
  });
  beforeEach(() => {
    scope = {};
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupClosureLifecycle(db, scope);
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  it('T13-B: readiness enumera todos los blockers sin cambiar estado y prepare devuelve un único borrador consecutivo', async () => {
    const f = await proyectoConIncumplimientos(db, scope);
    const { closure, readiness } = closureLifecycleStack(db);

    const estadoAntes = await db.proyecto.findUniqueOrThrow({
      where: { idProyecto: f.project.idProyecto },
      select: { estadoProyecto: true, fechaActualizacion: true },
    });
    const revisionesAntes = await db.revisionCierreProyecto.count({
      where: { idProyecto: f.project.idProyecto },
    });

    // Consultar enumera TODOS los incumplimientos, no solo el primero.
    const resumen = await closure.readiness(f.project.idProyecto, f.leader.idUsuario, 'REQUEST');
    const codigos = resumen.blockers.map((blocker) => blocker.code);
    for (const esperado of [
      'SPRINTS_NO_CERRADOS',
      'TRAMOS_ABIERTOS',
      'TAREAS_SIN_TERMINAR',
      'SALIDAS_ABIERTAS',
      'APELACION_PENDIENTE',
      'REVISION_INVALIDA',
    ]) {
      expect(codigos, esperado).toContain(esperado);
    }
    expect(resumen.canSubmit).toBe(false);
    // Cada blocker trae diagnóstico utilizable: código, mensaje, ids y cantidad.
    for (const blocker of resumen.blockers) {
      expect(typeof blocker.message).toBe('string');
      expect(blocker.message.length).toBeGreaterThan(0);
      expect(Array.isArray(blocker.ids)).toBe(true);
      expect(blocker.cantidad).toBe(blocker.ids.length);
    }
    const sprintsNoCerrados = resumen.blockers.find((b) => b.code === 'SPRINTS_NO_CERRADOS')!;
    expect(sprintsNoCerrados.ids).toContain(f.sprint.idSprint);

    // La advertencia informa y NO bloquea.
    expect(resumen.warnings).toHaveLength(1);
    expect(resumen.warnings[0].code).toBe('POSTULACIONES_PENDIENTES');
    expect(resumen.warnings[0].cantidad).toBe(1);
    expect(resumen.warnings[0].ids).toContain(f.postulacion.idPostulacion);
    expect(codigos).not.toContain('POSTULACIONES_PENDIENTES');

    // Consultar no cambia NADA.
    expect(
      await db.proyecto.findUniqueOrThrow({
        where: { idProyecto: f.project.idProyecto },
        select: { estadoProyecto: true, fechaActualizacion: true },
      }),
    ).toEqual(estadoAntes);
    expect(
      await db.revisionCierreProyecto.count({ where: { idProyecto: f.project.idProyecto } }),
    ).toBe(revisionesAntes);

    // Solo el líder consulta su preparación.
    for (const ajeno of [f.miembro.idUsuario, f.externo.idUsuario]) {
      await expectStatus(403, () =>
        closure.readiness(f.project.idProyecto, ajeno, 'REQUEST'),
      );
    }

    // Un proyecto en E no admite la fase de aprobación.
    const enAprobacion = await closure.readiness(
      f.project.idProyecto,
      f.leader.idUsuario,
      'APPROVE',
    );
    expect(enAprobacion.blockers.map((b) => b.code)).toContain('PROYECTO_ESTADO_INVALIDO');

    // Preparar es idempotente: dos veces, un solo borrador consecutivo.
    // El Sprint operable se cierra primero porque la preparación lo exige.
    await db.sprint.update({
      where: { idSprint: f.sprint.idSprint },
      data: { estado: 'CERRADO', fechaCierre: new Date() },
    });
    const primero = await closure.prepare(f.project.idProyecto, f.leader.idUsuario);
    expect(primero.numeroRevision).toBe(1);
    expect(primero.estadoRevision).toBe('BORRADOR');
    scope.revisionIds = [primero.idRevisionCierre];

    const segundo = await closure.prepare(f.project.idProyecto, f.leader.idUsuario);
    expect(segundo.idRevisionCierre).toBe(primero.idRevisionCierre);
    expect(
      await db.revisionCierreProyecto.count({ where: { idProyecto: f.project.idProyecto } }),
    ).toBe(1);
    // Un solo evento: el segundo prepare no creó nada que registrar.
    expect(
      await db.bitacoraAuditoria.count({
        where: {
          accion: 'CLOSURE_DRAFT_CREATED',
          idObjeto: String(primero.idRevisionCierre),
        },
      }),
    ).toBe(1);

    // Ni el participante ni el externo preparan el cierre.
    for (const ajeno of [f.miembro.idUsuario, f.externo.idUsuario]) {
      await expectStatus(403, () => closure.prepare(f.project.idProyecto, ajeno));
    }

    // Con el borrador ya creado, la revisión deja de ser un bloqueo y el
    // resto de incumplimientos sigue enumerándose.
    const conBorrador = await readiness.evaluate(undefined, f.project.idProyecto, {
      phase: 'REQUEST',
    });
    expect(conBorrador.revisionId).toBe(primero.idRevisionCierre);
    expect(conBorrador.blockers.map((b) => b.code)).not.toContain('REVISION_INVALIDA');
    expect(conBorrador.blockers.map((b) => b.code)).toContain('INFORME_INVALIDO');
    expect(conBorrador.blockers.map((b) => b.code)).toContain('EVIDENCIAS_INVALIDAS');
    expect(conBorrador.canSubmit).toBe(false);
  });
});
