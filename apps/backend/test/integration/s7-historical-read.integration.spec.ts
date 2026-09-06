import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { closedProjectFixture, cleanupHistoricalFixture, historicalStack } from './setup/historical-read';
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
 * C122+ (06 v2 §34/§46/§47 T35): lectura histórica de un proyecto cerrado.
 * Cerrar no borra ni publica: cambia quién puede leer y qué puede hacer.
 */
describeIntegration('S7 lectura histórica de proyectos', () => {
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
    await cleanupHistoricalFixture(db, scope);
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  it('T35-A: participantes activos, completados y retirados leen el proyecto histórico tras el cierre', async () => {
    const f = await closedProjectFixture(db, scope);
    const { service } = historicalStack(db);

    const lectores: Array<[string, number]> = [
      ['líder', f.leader.idUsuario],
      ['completado', f.completado.idUsuario],
      ['retirado', f.retirado.idUsuario],
    ];

    for (const [quien, actorId] of lectores) {
      const vista = await service.historicalProject(f.project.idProyecto, actorId);

      // Resumen del proyecto cerrado, sin exponer que fue eliminado.
      const resumen = vista.resumen as Record<string, unknown>;
      expect(resumen.idProyecto, quien).toBe(f.project.idProyecto);
      expect(resumen.estadoProyecto, quien).toBe('CERRADO');
      expect(Object.keys(resumen), quien).not.toContain('eliminadoEn');
      expect(JSON.stringify(vista), quien).not.toContain('eliminadoEn');

      // Liderazgo, miembros históricos y Sprints cerrados.
      const liderazgo = vista.liderazgo as { liderActual: { idUsuario: number } };
      expect(liderazgo.liderActual.idUsuario, quien).toBe(f.leader.idUsuario);
      const miembros = vista.miembrosHistoricos as Array<{ estadoParticipacion: string }>;
      expect(miembros.map((fila) => fila.estadoParticipacion).sort(), quien).toEqual([
        'COMPLETADO',
        'RETIRADO',
      ]);
      const sprints = vista.sprintsCerrados as Array<{ idSprint: number }>;
      expect(sprints.map((fila) => fila.idSprint), quien).toEqual([f.sprint.idSprint]);

      // Contribuciones y totales: las horas trabajadas siguen contando.
      const totales = vista.totales as Record<string, unknown>;
      expect(totales.reportadasGranulares, quien).toBe('8.00');
      expect(totales.tareasDistintas, quien).toBe(2);
      const eliminadas = vista.contribucionesEliminadas as Array<Record<string, unknown>>;
      expect(eliminadas, quien).toHaveLength(1);
      expect(eliminadas[0].razonDeInvisibilidad, quien).toBe('TAREA_ELIMINADA');
      expect(eliminadas[0].horasReportadas, quien).toBe('3.00');

      // Revisiones y el informe oficial SEPARADO de lo enviado.
      const revisiones = vista.revisiones as Array<{
        estadoRevision: string;
        documentosEnviados: Array<{ idDocumentoCierre: number; tipoDocumento: string }>;
      }>;
      expect(revisiones, quien).toHaveLength(1);
      expect(revisiones[0].estadoRevision, quien).toBe('APROBADA');
      expect(revisiones[0].documentosEnviados.map((doc) => doc.idDocumentoCierre), quien).toEqual([
        f.evidencia.idDocumentoCierre,
      ]);
      const oficial = vista.informeOficial as { idDocumentoCierre: number; tipoDocumento: string };
      expect(oficial.idDocumentoCierre, quien).toBe(f.oficial.idDocumentoCierre);
      expect(oficial.tipoDocumento, quien).toBe('INFORME_OFICIAL_FINAL');
      // El informe oficial no se cuela entre los documentos enviados.
      expect(
        revisiones[0].documentosEnviados.some(
          (doc) => doc.idDocumentoCierre === f.oficial.idDocumentoCierre,
        ),
        quien,
      ).toBe(false);

      // Ninguna bandera de escritura viene habilitada.
      const permisos = vista.permisos as Record<string, boolean>;
      expect(Object.values(permisos).every((valor) => valor === false), quien).toBe(true);

      // Y ningún material sensible viaja en la proyección.
      expect(JSON.stringify(vista), quien).not.toContain('wrappedDek');
      expect(JSON.stringify(vista), quien).not.toContain('cryptoMetadata');
    }

    // El retirado obtiene su contribución histórica sin operativa ajena: la
    // vista no habilita ninguna acción y su perfil es el de participante.
    const delRetirado = await service.historicalProject(
      f.project.idProyecto,
      f.retirado.idUsuario,
    );
    expect((delRetirado.lector as { perfil: string }).perfil).toBe('PARTICIPANTE_HISTORICO');

    // Un externo no lee el histórico de un proyecto en el que nunca estuvo.
    await expectStatus(403, () =>
      service.historicalProject(f.project.idProyecto, f.externo.idUsuario),
    );
  });
});
