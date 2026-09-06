import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { HttpException, ValidationPipe } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import {
  cleanupLeadershipFixture,
  collectInto,
  leadershipFixture,
  leadershipStack,
  type LeadershipCleanupScope,
} from './setup/leadership';
import { createIntegrationProject } from './setup/fixtures';
import {
  ADVERTENCIA_ADMIN_SIN_PARTICIPACION,
  ADVERTENCIA_APELACION_SIN_PARTICIPACION,
} from '../../src/leadership/leadership-read.service';
import { CreateLeadershipAppealDto } from '../../src/leadership/dto/create-leadership-appeal.dto';

/** Misma configuración que apps/backend/src/main.ts: el 400 lo produce el pipe real. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

function parseAppeal(plain: unknown): Promise<CreateLeadershipAppealDto> {
  return pipe.transform(plain, {
    type: 'body',
    metatype: CreateLeadershipAppealDto,
  }) as Promise<CreateLeadershipAppealDto>;
}

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

  it('T20-A: crear una apelación exige líder actual, candidato elegible y una sola pendiente por proyecto y líder', async () => {
    const f = await leadershipFixture(db, scope);
    const { service } = leadershipStack(db);
    const lider = f.leaderSinParticipacion.idUsuario;
    const valido = {
      asunto: 'Necesito dejar el liderazgo',
      mensaje: 'Ya no puedo sostener la coordinación del proyecto durante este ciclo.',
      idCandidatoPropuesto: f.elegible.idUsuario,
    };

    // El texto vacío y el mensaje desbordado los rechaza el pipe real: no
    // llegan nunca al service ni a la constraint CK10.
    await expectStatus(400, () => parseAppeal({ ...valido, asunto: '   ' }));
    await expectStatus(400, () => parseAppeal({ ...valido, mensaje: 'x'.repeat(10001) }));

    // Proponerse a sí mismo y proponer a quien tiene una salida abierta son
    // decisiones de elegibilidad, no de formato: 409 con sus motivos.
    const propio = await expectStatus(409, () =>
      service.createAppeal(f.project.idProyecto, lider, { ...valido, idCandidatoPropuesto: lider }),
    );
    expect(propio).toMatchObject({ code: 'SUCESOR_INELEGIBLE' });
    expect((propio as { motivos: string[] }).motivos).toContain('ES_EL_LIDER_ACTUAL');

    const conSalida = await expectStatus(409, () =>
      service.createAppeal(f.project.idProyecto, lider, {
        ...valido,
        idCandidatoPropuesto: f.conSalidaAbierta.idUsuario,
      }),
    );
    expect((conSalida as { motivos: string[] }).motivos).toContain('SALIDA_EN_CURSO');

    const creada = await service.createAppeal(f.project.idProyecto, lider, await parseAppeal(valido));
    expect(creada.estadoApelacion).toBe('PENDIENTE');
    expect(creada.idLiderSolicitante).toBe(lider);
    expect(creada.idCandidatoPropuesto).toBe(f.elegible.idUsuario);
    expect(creada.resueltaEn).toBeNull();
    expect(creada.idAdminResolutor).toBeNull();
    expect(creada.mensajeResolucion).toBeNull();

    // Una pendiente por proyecto y líder: la repetición choca con el índice
    // parcial y no deja una segunda fila.
    await expectStatus(409, () =>
      service.createAppeal(f.project.idProyecto, lider, {
        ...valido,
        asunto: 'Segundo intento',
      }),
    );
    expect(
      await db.apelacionLiderazgo.count({ where: { idProyecto: f.project.idProyecto } }),
    ).toBe(1);

    // Un participante ordinario no apela: apelar es del líder actual.
    await expectStatus(403, () =>
      service.createAppeal(f.project.idProyecto, f.elegible.idUsuario, {
        ...valido,
        idCandidatoPropuesto: lider,
      }),
    );

    // Un proyecto en BORRADOR no tiene liderazgo que transferir todavía.
    await expectStatus(409, () => service.createAppeal(f.draft.idProyecto, lider, valido));

    // Los efectos viven en la misma transacción que la apelación.
    const eventos = await db.bitacoraAuditoria.findMany({
      where: { accion: 'LEADERSHIP_APPEAL_CREATED', idObjeto: String(creada.idApelacion) },
    });
    expect(eventos).toHaveLength(1);
    expect(eventos[0].idUsuario).toBe(lider);

    const avisos = await db.notificacion.findMany({
      where: { idUsuario: f.admin.idUsuario, tipoNotificacion: 'APELACION_LIDERAZGO_RECIBIDA' },
    });
    expect(avisos).toHaveLength(1);

    // Crear no mueve el liderazgo ni la membresía de nadie.
    const proyecto = await db.proyecto.findUniqueOrThrow({
      where: { idProyecto: f.project.idProyecto },
    });
    expect(proyecto.creadoPor).toBe(lider);
    expect(await db.historialLiderazgo.count()).toBe(0);
  });

  it('T20-B: cancelar una apelación exige ser el autor que aún lidera y que siga pendiente', async () => {
    const f = await leadershipFixture(db, scope);
    const { service } = leadershipStack(db);
    const lider = f.leaderSinParticipacion.idUsuario;

    const propia = await service.createAppeal(f.project.idProyecto, lider, {
      asunto: 'Transferencia solicitada',
      mensaje: 'Solicito que se designe un nuevo líder para el proyecto.',
      idCandidatoPropuesto: f.elegible.idUsuario,
    });

    // Segundo proyecto: A apeló y el liderazgo ya cambió de manos.
    const entregado = await createIntegrationProject(db, lider, { estadoProyecto: 'EN_PROGRESO' });
    collectInto(scope, 'projectIds', [entregado.idProyecto]);
    const huerfana = await db.apelacionLiderazgo.create({
      data: {
        idProyecto: entregado.idProyecto,
        idLiderSolicitante: lider,
        asunto: 'Apelación de un liderazgo ya entregado',
        mensaje: 'Se mantuvo pendiente después de que el liderazgo cambiara.',
        idCandidatoPropuesto: f.elegible.idUsuario,
      },
    });
    await db.proyecto.update({
      where: { idProyecto: entregado.idProyecto },
      data: { creadoPor: f.leaderConParticipacion.idUsuario },
    });

    // Una apelación ya resuelta que nadie debe poder tocar.
    const denegada = await db.apelacionLiderazgo.create({
      data: {
        idProyecto: f.project.idProyecto,
        idLiderSolicitante: f.elegible.idUsuario,
        asunto: 'Apelación resuelta',
        mensaje: 'Fue denegada antes de esta prueba.',
        idCandidatoPropuesto: lider,
        estadoApelacion: 'DENEGADA',
        resueltaEn: new Date('2026-09-02T12:00:00.000Z'),
        idAdminResolutor: f.admin.idUsuario,
        mensajeResolucion: 'No procede en este ciclo.',
      },
    });

    // El nuevo líder no cancela la apelación del anterior: no es su autor.
    await expectStatus(403, () =>
      service.cancelAppeal(
        entregado.idProyecto,
        huerfana.idApelacion,
        f.leaderConParticipacion.idUsuario,
      ),
    );
    // El administrador tampoco cancela por esta ruta.
    await expectStatus(403, () =>
      service.cancelAppeal(f.project.idProyecto, propia.idApelacion, f.admin.idUsuario),
    );
    // El autor que ya no lidera tampoco: la autoridad que apeló ya no es suya.
    await expectStatus(403, () =>
      service.cancelAppeal(entregado.idProyecto, huerfana.idApelacion, lider),
    );

    const cancelada = await service.cancelAppeal(f.project.idProyecto, propia.idApelacion, lider);
    expect(cancelada.estadoApelacion).toBe('CANCELADA');
    expect(cancelada.resueltaEn).not.toBeNull();
    expect(cancelada.idAdminResolutor).toBeNull();
    expect(cancelada.mensajeResolucion).toBeNull();
    expect(
      await db.bitacoraAuditoria.count({
        where: { accion: 'LEADERSHIP_APPEAL_CANCELLED', idObjeto: String(propia.idApelacion) },
      }),
    ).toBe(1);

    // Repetir es un conflicto, no un segundo efecto.
    await expectStatus(409, () =>
      service.cancelAppeal(f.project.idProyecto, propia.idApelacion, lider),
    );
    expect(
      await db.bitacoraAuditoria.count({
        where: { accion: 'LEADERSHIP_APPEAL_CANCELLED', idObjeto: String(propia.idApelacion) },
      }),
    ).toBe(1);

    // Las resueltas se conservan intactas y el liderazgo no se movió.
    const resuelta = await db.apelacionLiderazgo.findUniqueOrThrow({
      where: { idApelacion: denegada.idApelacion },
    });
    expect(resuelta.estadoApelacion).toBe('DENEGADA');
    expect(resuelta.mensajeResolucion).toBe('No procede en este ciclo.');
    expect(
      (await db.proyecto.findUniqueOrThrow({ where: { idProyecto: f.project.idProyecto } })).creadoPor,
    ).toBe(lider);
    expect(
      (await db.proyecto.findUniqueOrThrow({ where: { idProyecto: entregado.idProyecto } })).creadoPor,
    ).toBe(f.leaderConParticipacion.idUsuario);
    expect(await db.historialLiderazgo.count()).toBe(0);
  });
});
