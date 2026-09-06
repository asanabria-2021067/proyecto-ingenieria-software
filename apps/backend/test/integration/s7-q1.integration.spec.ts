import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import {
  cleanupLeadershipFixture,
  leadershipFixture,
  leadershipStack,
  type LeadershipCleanupScope,
} from './setup/leadership';
import {
  ADVERTENCIA_ADMIN_SIN_PARTICIPACION,
  ADVERTENCIA_APELACION_SIN_PARTICIPACION,
} from '../../src/leadership/leadership-read.service';

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

describeIntegration('S7 liderazgo y Q1', () => {
  let db: PrismaClient;
  let scope: LeadershipCleanupScope;

  beforeAll(async () => {
    db = createIntegrationPrismaClient();
    await db.$connect();
  });
  beforeEach(() => {
    scope = {};
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupLeadershipFixture(db, scope);
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  it('T19-A: el contexto de liderazgo deriva Q1 de la participación real, entrega los warnings exactos y no crea filas', async () => {
    const f = await leadershipFixture(db, scope);
    const { read } = leadershipStack(db);

    const conteoPrevio = async () => ({
      apelaciones: await db.apelacionLiderazgo.count(),
      historial: await db.historialLiderazgo.count(),
      roles: await db.rolProyecto.count({
        where: { idProyecto: { in: [f.project.idProyecto, f.twin.idProyecto] } },
      }),
      participaciones: await db.participacionProyecto.count({
        where: {
          rolProyecto: { idProyecto: { in: [f.project.idProyecto, f.twin.idProyecto] } },
        },
      }),
    });
    const antes = await conteoPrevio();

    // Líder SIN participación activa: Q1 dice que perderá la membresía.
    const contextoLider = await read.context(undefined, {
      projectId: f.project.idProyecto,
      actorId: f.leaderSinParticipacion.idUsuario,
    });
    expect(contextoLider.projectId).toBe(f.project.idProyecto);
    expect(contextoLider.estadoProyecto).toBe('EN_PROGRESO');
    expect(contextoLider.liderActual.idUsuario).toBe(f.leaderSinParticipacion.idUsuario);
    expect(contextoLider.tieneParticipacionActiva).toBe(false);
    expect(contextoLider.participacionesActivas).toEqual([]);
    expect(contextoLider.conservaMembresiaSiSeTransfiere).toBe(false);
    // Texto exacto de §6, carácter a carácter.
    expect(contextoLider.advertenciaApelacion).toBe(ADVERTENCIA_APELACION_SIN_PARTICIPACION);
    expect(contextoLider.advertenciaAdmin).toBeNull();

    // El mismo proyecto leído por el admin: la advertencia que le corresponde
    // es la administrativa, porque es quien confirma el cambio.
    const contextoAdmin = await read.context(undefined, {
      projectId: f.project.idProyecto,
      actorId: f.admin.idUsuario,
    });
    expect(contextoAdmin.tieneParticipacionActiva).toBe(false);
    expect(contextoAdmin.advertenciaAdmin).toBe(ADVERTENCIA_ADMIN_SIN_PARTICIPACION);
    expect(contextoAdmin.advertenciaApelacion).toBeNull();

    // Proyecto gemelo: el líder tiene DOS participaciones activas y las
    // conserva íntegras si se transfiere; sin advertencia para nadie.
    const contextoGemelo = await read.context(undefined, {
      projectId: f.twin.idProyecto,
      actorId: f.leaderConParticipacion.idUsuario,
    });
    expect(contextoGemelo.tieneParticipacionActiva).toBe(true);
    expect(contextoGemelo.conservaMembresiaSiSeTransfiere).toBe(true);
    expect(contextoGemelo.participacionesActivas).toHaveLength(2);
    expect(contextoGemelo.participacionesActivas.map((fila) => fila.idRolProyecto).sort()).toEqual(
      [f.twinRoleA.idRolProyecto, f.twinRoleB.idRolProyecto].sort(),
    );
    expect(contextoGemelo.advertenciaApelacion).toBeNull();
    expect(contextoGemelo.advertenciaAdmin).toBeNull();

    const contextoGemeloAdmin = await read.context(undefined, {
      projectId: f.twin.idProyecto,
      actorId: f.admin.idUsuario,
    });
    expect(contextoGemeloAdmin.advertenciaAdmin).toBeNull();
    expect(contextoGemeloAdmin.advertenciaApelacion).toBeNull();

    // Candidatos: la lista completa, anotada y sin ranking.
    const candidatos = await read.candidates(undefined, {
      projectId: f.project.idProyecto,
      actorId: f.leaderSinParticipacion.idUsuario,
    });
    expect(candidatos.contexto.advertenciaApelacion).toBe(ADVERTENCIA_APELACION_SIN_PARTICIPACION);
    const porUsuario = new Map(candidatos.candidatos.map((fila) => [fila.idUsuario, fila]));
    // El retirado no aparece: su participación ya no es activa.
    expect(porUsuario.has(f.retirado.idUsuario)).toBe(false);

    const elegible = porUsuario.get(f.elegible.idUsuario);
    expect(elegible?.esElegible).toBe(true);
    expect(elegible?.seleccionable).toBe(true);
    expect(elegible?.motivos).toEqual([]);
    expect(elegible?.rolesActivos).toEqual([
      { idRolProyecto: f.role.idRolProyecto, nombreRol: f.role.nombreRol },
    ]);
    // Hechos objetivos, no mérito: horas efectivas y tareas distintas.
    expect(elegible?.horasReportadas).toBe('4.25');
    expect(elegible?.horasLegacy).toBe('0.00');
    expect(elegible?.tareasDistintas).toBe(1);

    const conSalida = porUsuario.get(f.conSalidaAbierta.idUsuario);
    expect(conSalida?.esElegible).toBe(false);
    expect(conSalida?.seleccionable).toBe(false);
    expect(conSalida?.motivos).toContain('SALIDA_EN_CURSO');
    expect(conSalida?.horasReportadas).toBe('0.00');

    const deshabilitado = porUsuario.get(f.deshabilitado.idUsuario);
    expect(deshabilitado?.esElegible).toBe(false);
    expect(deshabilitado?.motivos).toContain('USUARIO_DESHABILITADO');

    // Sin ranking: el orden es estable por identificador, no por horas.
    expect(candidatos.candidatos.map((fila) => fila.idUsuario)).toEqual(
      [...candidatos.candidatos.map((fila) => fila.idUsuario)].sort((a, b) => a - b),
    );

    // El admin ve exactamente la misma lista.
    const candidatosAdmin = await read.candidates(undefined, {
      projectId: f.project.idProyecto,
      actorId: f.admin.idUsuario,
    });
    expect(candidatosAdmin.candidatos.map((fila) => fila.idUsuario)).toEqual(
      candidatos.candidatos.map((fila) => fila.idUsuario),
    );

    // Un participante ordinario no lee Q1 ni los sucesores posibles.
    await expectStatus(403, () =>
      read.context(undefined, { projectId: f.project.idProyecto, actorId: f.elegible.idUsuario }),
    );
    await expectStatus(403, () =>
      read.candidates(undefined, { projectId: f.project.idProyecto, actorId: f.elegible.idUsuario }),
    );

    // Consultar no crea apelación, historial, rol ni participación.
    expect(await conteoPrevio()).toEqual(antes);
  });
});
