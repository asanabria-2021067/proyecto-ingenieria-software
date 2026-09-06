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
import {
  createIntegrationParticipation,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationSprint,
  createIntegrationTask,
  createIntegrationTaskAssignment,
  createIntegrationUser,
} from './setup/fixtures';
import { tasksStack } from './setup/tasks-stack';
import { exitStack } from './setup/exit-flow';
import {
  ADVERTENCIA_ADMIN_SIN_PARTICIPACION,
  ADVERTENCIA_APELACION_SIN_PARTICIPACION,
} from '../../src/leadership/leadership-read.service';
import { CreateLeadershipAppealDto } from '../../src/leadership/dto/create-leadership-appeal.dto';
import { DenyAppealDto } from '../../src/leadership/dto/deny-appeal.dto';
import { MOTIVO_CANCELACION_AUTOMATICA } from '../../src/leadership/leadership.service';

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

function parseDenial(plain: unknown): Promise<DenyAppealDto> {
  return pipe.transform(plain, {
    type: 'body',
    metatype: DenyAppealDto,
  }) as Promise<DenyAppealDto>;
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

  it('T20-C: denegar una apelación exige admin y motivo, no cambia el líder y notifica al autor aunque ya no participe', async () => {
    const f = await leadershipFixture(db, scope);
    const { service } = leadershipStack(db);
    // A lidera el proyecto y NO tiene participación activa: la respuesta a su
    // apelación le llega igual.
    const lider = f.leaderSinParticipacion.idUsuario;
    expect(
      await db.participacionProyecto.count({
        where: { idUsuario: lider, rolProyecto: { idProyecto: f.project.idProyecto } },
      }),
    ).toBe(0);

    const apelacion = await service.createAppeal(f.project.idProyecto, lider, {
      asunto: 'Transferencia solicitada',
      mensaje: 'Solicito que se designe un nuevo líder para el proyecto.',
      idCandidatoPropuesto: f.elegible.idUsuario,
    });

    const denegar = async (actorId: number, payload: unknown) =>
      service.denyAppeal(
        f.project.idProyecto,
        apelacion.idApelacion,
        actorId,
        await parseDenial(payload),
      );

    // Denegar es potestad del administrador, no del equipo.
    await expectStatus(403, () =>
      denegar(f.elegible.idUsuario, { mensajeResolucion: 'no procede' }),
    );
    // Sin motivo y con un motivo en blanco: el payload no es válido.
    await expectStatus(400, () => denegar(f.admin.idUsuario, {}));
    await expectStatus(400, () => denegar(f.admin.idUsuario, { mensajeResolucion: '   ' }));

    const denegada = await denegar(f.admin.idUsuario, {
      mensajeResolucion: 'El proyecto está a mitad de Sprint; se revisará al cierre.',
    });
    expect(denegada.estadoApelacion).toBe('DENEGADA');
    expect(denegada.resueltaEn).not.toBeNull();
    expect(denegada.idAdminResolutor).toBe(f.admin.idUsuario);
    expect(denegada.mensajeResolucion).toBe(
      'El proyecto está a mitad de Sprint; se revisará al cierre.',
    );

    // El liderazgo y las participaciones quedan exactamente donde estaban.
    expect(
      (await db.proyecto.findUniqueOrThrow({ where: { idProyecto: f.project.idProyecto } })).creadoPor,
    ).toBe(lider);
    expect(await db.historialLiderazgo.count()).toBe(0);

    expect(
      await db.bitacoraAuditoria.count({
        where: { accion: 'LEADERSHIP_APPEAL_DENIED', idObjeto: String(apelacion.idApelacion) },
      }),
    ).toBe(1);
    const avisos = await db.notificacion.findMany({
      where: { idUsuario: lider, tipoNotificacion: 'APELACION_LIDERAZGO_RESUELTA' },
    });
    expect(avisos).toHaveLength(1);

    // Repetir la denegación es un conflicto sin segundo evento ni aviso.
    await expectStatus(409, () =>
      denegar(f.admin.idUsuario, { mensajeResolucion: 'insistiendo sobre lo ya resuelto' }),
    );
    expect(
      await db.bitacoraAuditoria.count({
        where: { accion: 'LEADERSHIP_APPEAL_DENIED', idObjeto: String(apelacion.idApelacion) },
      }),
    ).toBe(1);
    expect(
      await db.notificacion.count({
        where: { idUsuario: lider, tipoNotificacion: 'APELACION_LIDERAZGO_RESUELTA' },
      }),
    ).toBe(1);
  });

  it('T18-B: el exlíder sin participación lee solo su historial y sus apelaciones, y la bandeja administrativa lista las pendientes', async () => {
    const f = await leadershipFixture(db, scope);
    const { read } = leadershipStack(db);
    const a = f.leaderSinParticipacion.idUsuario;
    const b = f.elegible.idUsuario;

    const c = await createIntegrationUser(db);
    collectInto(scope, 'userIds', [c.idUsuario]);
    const participacionC = await createIntegrationParticipation(db, c.idUsuario, f.role.idRolProyecto, {
      estadoParticipacion: 'ACTIVO',
    });
    collectInto(scope, 'participationIds', [participacionC.idParticipacion]);

    // A apeló, la apelación se aceptó y el liderazgo pasó a B; después un
    // cambio administrativo directo lo llevó de B a C.
    const apelacionDeA = await db.apelacionLiderazgo.create({
      data: {
        idProyecto: f.project.idProyecto,
        idLiderSolicitante: a,
        asunto: 'Apelación de A',
        mensaje: 'Solicito la transferencia del liderazgo.',
        idCandidatoPropuesto: b,
        estadoApelacion: 'ACEPTADA',
        creadaEn: new Date('2026-09-02T10:00:00.000Z'),
        resueltaEn: new Date('2026-09-03T10:00:00.000Z'),
        idAdminResolutor: f.admin.idUsuario,
      },
    });
    const porApelacion = await db.historialLiderazgo.create({
      data: {
        idProyecto: f.project.idProyecto,
        idLiderAnterior: a,
        idLiderNuevo: b,
        idAdminResponsable: f.admin.idUsuario,
        motivo: 'Se acepta la apelación del líder saliente.',
        origen: 'SOLICITUD_LIDER',
        idApelacion: apelacionDeA.idApelacion,
        registradoEn: new Date('2026-09-03T10:00:00.000Z'),
      },
    });
    const directo = await db.historialLiderazgo.create({
      data: {
        idProyecto: f.project.idProyecto,
        idLiderAnterior: b,
        idLiderNuevo: c.idUsuario,
        idAdminResponsable: f.admin.idUsuario,
        motivo: 'Cambio administrativo por inactividad sostenida.',
        origen: 'CAMBIO_ADMINISTRATIVO',
        registradoEn: new Date('2026-09-04T10:00:00.000Z'),
      },
    });
    const apelacionDeB = await db.apelacionLiderazgo.create({
      data: {
        idProyecto: f.project.idProyecto,
        idLiderSolicitante: b,
        asunto: 'Apelación de B',
        mensaje: 'Sigue pendiente de resolución.',
        idCandidatoPropuesto: c.idUsuario,
        creadaEn: new Date('2026-09-05T10:00:00.000Z'),
      },
    });
    await db.proyecto.update({
      where: { idProyecto: f.project.idProyecto },
      data: { creadoPor: c.idUsuario },
    });

    // Admin y líder actual ven la historia completa.
    for (const lector of [f.admin.idUsuario, c.idUsuario]) {
      const historial = await read.history(undefined, {
        projectId: f.project.idProyecto,
        actorId: lector,
      });
      expect(historial.total).toBe(2);
      expect(historial.page).toBe(1);
      expect(historial.limit).toBe(20);
      // Orden: lo más reciente primero.
      expect(historial.items.map((fila) => fila.idHistorialLiderazgo)).toEqual([
        directo.idHistorialLiderazgo,
        porApelacion.idHistorialLiderazgo,
      ]);
      // El candidato sugerido viaja por la FK de la apelación.
      const aceptada = historial.items[1];
      expect(aceptada.origen).toBe('SOLICITUD_LIDER');
      expect(aceptada.idApelacion).toBe(apelacionDeA.idApelacion);
      expect(aceptada.candidatoSugerido?.idUsuario).toBe(b);
      // El cambio directo no tuvo candidato sugerido y no se le inventa uno.
      expect(historial.items[0].origen).toBe('CAMBIO_ADMINISTRATIVO');
      expect(historial.items[0].idApelacion).toBeNull();
      expect(historial.items[0].candidatoSugerido).toBeNull();
    }

    // `HistorialLiderazgo` no duplica el candidato: no existe tal columna.
    const filaCruda = await db.historialLiderazgo.findUniqueOrThrow({
      where: { idHistorialLiderazgo: porApelacion.idHistorialLiderazgo },
    });
    expect(Object.keys(filaCruda)).not.toContain('idCandidatoPropuesto');

    // A ya no participa ni lidera: solo sus propios hechos.
    const historialDeA = await read.history(undefined, {
      projectId: f.project.idProyecto,
      actorId: a,
    });
    expect(historialDeA.total).toBe(1);
    expect(historialDeA.items[0].idHistorialLiderazgo).toBe(porApelacion.idHistorialLiderazgo);

    const apelacionesDeA = await read.appeals(undefined, {
      projectId: f.project.idProyecto,
      actorId: a,
    });
    expect(apelacionesDeA.total).toBe(1);
    expect(apelacionesDeA.items[0].idApelacion).toBe(apelacionDeA.idApelacion);
    expect(apelacionesDeA.items[0].liderSolicitante.idUsuario).toBe(a);

    // El resto del proyecto no se le abre por haber liderado.
    await expectStatus(403, () =>
      read.context(undefined, { projectId: f.project.idProyecto, actorId: a }),
    );

    // El líder actual ve las dos apelaciones del proyecto.
    const apelacionesLider = await read.appeals(undefined, {
      projectId: f.project.idProyecto,
      actorId: c.idUsuario,
    });
    expect(apelacionesLider.total).toBe(2);
    expect(apelacionesLider.items.map((fila) => fila.idApelacion)).toEqual([
      apelacionDeB.idApelacion,
      apelacionDeA.idApelacion,
    ]);

    // Un participante ordinario de un proyecto vivo no lee el liderazgo.
    await expectStatus(403, () =>
      read.history(undefined, { projectId: f.project.idProyecto, actorId: f.conSalidaAbierta.idUsuario }),
    );

    // Bandeja administrativa: pagina, filtra y no amplía la audiencia.
    const bandeja = await read.adminInbox(undefined, { actorId: f.admin.idUsuario });
    expect(bandeja.items.length).toBeGreaterThanOrEqual(2);
    const claves = bandeja.items.map((fila) => [fila.creadaEn.getTime(), fila.idApelacion]);
    expect(claves).toEqual(
      [...claves].sort((x, y) => (y[0] === x[0] ? y[1] - x[1] : y[0] - x[0])),
    );
    const pendientes = await read.adminInbox(undefined, {
      actorId: f.admin.idUsuario,
      query: { estado: 'PENDIENTE' },
    });
    expect(pendientes.items.every((fila) => fila.estadoApelacion === 'PENDIENTE')).toBe(true);
    expect(pendientes.items.map((fila) => fila.idApelacion)).toContain(apelacionDeB.idApelacion);
    const primeraPagina = await read.adminInbox(undefined, {
      actorId: f.admin.idUsuario,
      query: { page: 1, limit: 1 },
    });
    expect(primeraPagina.items).toHaveLength(1);
    expect(primeraPagina.limit).toBe(1);
    // El filtro no convierte a nadie en administrador.
    await expectStatus(403, () =>
      read.adminInbox(undefined, { actorId: a, query: { estado: 'PENDIENTE' } }),
    );
    await expectStatus(403, () => read.adminInbox(undefined, { actorId: c.idUsuario }));

    // Un participante AUTORIZADO por la policy sí lee la historia completa:
    // en un proyecto cerrado el histórico le corresponde.
    const cerrado = await createIntegrationProject(db, f.admin.idUsuario, {
      estadoProyecto: 'CERRADO',
    });
    collectInto(scope, 'projectIds', [cerrado.idProyecto]);
    const rolCerrado = await createIntegrationProjectRole(db, cerrado.idProyecto, { cupos: 2 });
    collectInto(scope, 'roleIds', [rolCerrado.idRolProyecto]);
    const participacionCerrado = await createIntegrationParticipation(
      db,
      f.retirado.idUsuario,
      rolCerrado.idRolProyecto,
      { estadoParticipacion: 'ACTIVO' },
    );
    collectInto(scope, 'participationIds', [participacionCerrado.idParticipacion]);
    await db.historialLiderazgo.create({
      data: {
        idProyecto: cerrado.idProyecto,
        idLiderAnterior: a,
        idLiderNuevo: f.admin.idUsuario,
        idAdminResponsable: f.admin.idUsuario,
        motivo: 'Cambio registrado antes del cierre.',
        origen: 'CAMBIO_ADMINISTRATIVO',
      },
    });
    const historialCerrado = await read.history(undefined, {
      projectId: cerrado.idProyecto,
      actorId: f.retirado.idUsuario,
    });
    expect(historialCerrado.total).toBe(1);
  });

  it('T19-B: el admin transfiere el liderazgo sin cooperación del saliente y cancela su apelación pendiente en la misma transacción', async () => {
    const f = await leadershipFixture(db, scope);
    const { service, read, gateway } = leadershipStack(db);
    const a = f.leaderSinParticipacion.idUsuario;
    const b = f.elegible.idUsuario;

    const apelacion = await service.createAppeal(f.project.idProyecto, a, {
      asunto: 'Solicito dejar el liderazgo',
      mensaje: 'No puedo sostener la coordinación durante este ciclo.',
      idCandidatoPropuesto: b,
    });

    // Foto exacta de todo lo que la transferencia NO debe tocar.
    const snapshot = async () => ({
      participaciones: await db.participacionProyecto.findMany({
        where: { rolProyecto: { idProyecto: f.project.idProyecto } },
        orderBy: { idParticipacion: 'asc' },
      }),
      roles: await db.rolProyecto.findMany({
        where: { idProyecto: f.project.idProyecto },
        orderBy: { idRolProyecto: 'asc' },
      }),
      tareas: await db.tarea.findMany({
        where: { idProyecto: f.project.idProyecto },
        orderBy: { idTarea: 'asc' },
      }),
      asignaciones: await db.asignacionTarea.findMany({
        where: { tarea: { idProyecto: f.project.idProyecto } },
        orderBy: { idAsignacion: 'asc' },
      }),
      registros: await db.registroTiempoTarea.findMany({
        where: { asignacion: { tarea: { idProyecto: f.project.idProyecto } } },
        orderBy: { idRegistroTiempo: 'asc' },
      }),
    });
    const antes = await snapshot();

    // El admin ve la advertencia que le corresponde antes de confirmar.
    const contexto = await read.context(undefined, {
      projectId: f.project.idProyecto,
      actorId: f.admin.idUsuario,
    });
    expect(contexto.advertenciaAdmin).toBe(ADVERTENCIA_ADMIN_SIN_PARTICIPACION);

    const resultado = await service.transfer(f.project.idProyecto, f.admin.idUsuario, {
      idLiderNuevo: b,
      expectedLeaderId: a,
      motivo: 'El líder actual dejó de participar y el proyecto necesita conducción.',
    });
    expect(resultado.liderAnteriorId).toBe(a);
    expect(resultado.liderNuevoId).toBe(b);
    expect(resultado.salienteTieneParticipacionActiva).toBe(false);
    expect(resultado.efectoSaliente).toBe('SIN_MEMBRESIA_OPERATIVA');

    // El liderazgo se movió sin que A hiciera nada.
    expect(
      (await db.proyecto.findUniqueOrThrow({ where: { idProyecto: f.project.idProyecto } })).creadoPor,
    ).toBe(b);

    const historial = await db.historialLiderazgo.findMany({
      where: { idProyecto: f.project.idProyecto },
    });
    expect(historial).toHaveLength(1);
    expect(historial[0].idHistorialLiderazgo).toBe(resultado.historialId);
    expect(historial[0].origen).toBe('CAMBIO_ADMINISTRATIVO');
    expect(historial[0].idApelacion).toBeNull();
    expect(historial[0].idAdminResponsable).toBe(f.admin.idUsuario);

    // La apelación de A caducó en la MISMA transacción, con motivo automático.
    const caducada = await db.apelacionLiderazgo.findUniqueOrThrow({
      where: { idApelacion: apelacion.idApelacion },
    });
    expect(caducada.estadoApelacion).toBe('CANCELADA');
    expect(caducada.resueltaEn).not.toBeNull();
    expect(caducada.mensajeResolucion).toBe(MOTIVO_CANCELACION_AUTOMATICA);

    expect(
      await db.bitacoraAuditoria.count({
        where: { accion: 'LEADERSHIP_CHANGED', idObjeto: String(f.project.idProyecto) },
      }),
    ).toBe(1);
    expect(
      await db.bitacoraAuditoria.count({
        where: { accion: 'LEADERSHIP_APPEAL_CANCELLED', idObjeto: String(apelacion.idApelacion) },
      }),
    ).toBe(1);

    // Una fila de LIDERAZGO_ACTUALIZADO por destinatario: A, B y cada usuario
    // del equipo activo, exactamente una vez.
    const avisos = await db.notificacion.findMany({
      where: { tipoNotificacion: 'LIDERAZGO_ACTUALIZADO', idUsuario: { in: scope.userIds ?? [] } },
    });
    const destinatarios = avisos.map((fila) => fila.idUsuario).sort((x, y) => x - y);
    expect(destinatarios).toEqual(
      [a, b, f.conSalidaAbierta.idUsuario, f.deshabilitado.idUsuario].sort((x, y) => x - y),
    );
    expect(new Set(destinatarios).size).toBe(destinatarios.length);

    // Realtime post-commit: una sola emisión, ya con la transacción cerrada.
    const emisiones = gateway.emitToUsers.mock.calls.filter(
      (llamada) => llamada[0] === 'LEADERSHIP_CHANGED',
    );
    expect(emisiones).toHaveLength(1);
    expect(emisiones[0][2]).toMatchObject({
      projectId: f.project.idProyecto,
      liderAnteriorId: a,
      liderNuevoId: b,
    });

    // Un sucesor no elegible no recibe el liderazgo.
    await expectStatus(409, () =>
      service.transfer(f.project.idProyecto, f.admin.idUsuario, {
        idLiderNuevo: f.conSalidaAbierta.idUsuario,
        expectedLeaderId: b,
        motivo: 'Intento con un candidato que tiene una salida abierta.',
      }),
    );

    // Repetir con el líder esperado ya obsoleto es un conflicto sin segundo
    // historial.
    await expectStatus(409, () =>
      service.transfer(f.project.idProyecto, f.admin.idUsuario, {
        idLiderNuevo: f.deshabilitado.idUsuario,
        expectedLeaderId: a,
        motivo: 'Reintento con una intención antigua.',
      }),
    );
    expect(await db.historialLiderazgo.count({ where: { idProyecto: f.project.idProyecto } })).toBe(1);

    // Participaciones, roles, tareas, asignaciones y horas: idénticas.
    expect(await snapshot()).toEqual(antes);
  });

  it('T20-D: aceptar una apelación relee la participación actual y admite un sucesor distinto del sugerido', async () => {
    const f = await leadershipFixture(db, scope);
    const { service, gateway } = leadershipStack(db);
    // A lidera el proyecto gemelo y, al apelar, participa en dos roles.
    const a = f.leaderConParticipacion.idUsuario;

    const sugerido = await createIntegrationUser(db);
    const sucesor = await createIntegrationUser(db);
    collectInto(scope, 'userIds', [sugerido.idUsuario, sucesor.idUsuario]);
    const participacionesCandidatos = await Promise.all([
      createIntegrationParticipation(db, sugerido.idUsuario, f.twinRoleA.idRolProyecto, {
        estadoParticipacion: 'ACTIVO',
      }),
      createIntegrationParticipation(db, sucesor.idUsuario, f.twinRoleA.idRolProyecto, {
        estadoParticipacion: 'ACTIVO',
      }),
    ]);
    collectInto(
      scope,
      'participationIds',
      participacionesCandidatos.map((fila) => fila.idParticipacion),
    );

    const apelacion = await service.createAppeal(f.twin.idProyecto, a, {
      asunto: 'Solicito transferir el liderazgo',
      mensaje: 'Propongo a un integrante que conoce el proyecto.',
      idCandidatoPropuesto: sugerido.idUsuario,
    });
    expect(apelacion.idCandidatoPropuesto).toBe(sugerido.idUsuario);
    // Al apelar, A SÍ tenía participación activa.
    expect(
      await db.participacionProyecto.count({
        where: {
          idUsuario: a,
          estadoParticipacion: 'ACTIVO',
          rolProyecto: { idProyecto: f.twin.idProyecto },
        },
      }),
    ).toBe(2);

    // Entre la creación y la aceptación, A deja de participar. Ningún flujo
    // normal permite a un líder abandonar su ÚLTIMO rol (RolesService.leaveRole
    // lo rechaza) ni usar la salida ordinaria (reservada a quien no lidera),
    // así que el estado se prepara aquí: lo que la prueba verifica es que la
    // aceptación lea el estado ACTUAL, no cómo se llegó a él.
    await db.participacionProyecto.updateMany({
      where: { idUsuario: a, rolProyecto: { idProyecto: f.twin.idProyecto } },
      data: { estadoParticipacion: 'RETIRADO', fechaSalida: new Date() },
    });

    const resultado = await service.transfer(
      f.twin.idProyecto,
      f.admin.idUsuario,
      {
        idLiderNuevo: sucesor.idUsuario,
        expectedLeaderId: a,
        motivo: 'Se acepta la apelación y se designa a un sucesor elegible.',
      },
      apelacion.idApelacion,
    );

    // El sucesor designado puede diferir del sugerido.
    expect(resultado.liderNuevoId).toBe(sucesor.idUsuario);
    expect(resultado.liderNuevoId).not.toBe(sugerido.idUsuario);
    // Q1 se resolvió con el estado ACTUAL, no con el del momento de apelar, y
    // la variación no bloqueó la transferencia.
    expect(resultado.salienteTieneParticipacionActiva).toBe(false);
    expect(resultado.efectoSaliente).toBe('SIN_MEMBRESIA_OPERATIVA');

    const resuelta = await db.apelacionLiderazgo.findUniqueOrThrow({
      where: { idApelacion: apelacion.idApelacion },
    });
    expect(resuelta.estadoApelacion).toBe('ACEPTADA');
    expect(resuelta.resueltaEn).not.toBeNull();
    expect(resuelta.idAdminResolutor).toBe(f.admin.idUsuario);
    // El candidato sugerido permanece inmutable como hecho histórico.
    expect(resuelta.idCandidatoPropuesto).toBe(sugerido.idUsuario);

    const historial = await db.historialLiderazgo.findUniqueOrThrow({
      where: { idHistorialLiderazgo: resultado.historialId },
    });
    expect(historial.origen).toBe('SOLICITUD_LIDER');
    expect(historial.idApelacion).toBe(apelacion.idApelacion);
    expect(historial.idLiderNuevo).toBe(sucesor.idUsuario);
    expect(
      (await db.proyecto.findUniqueOrThrow({ where: { idProyecto: f.twin.idProyecto } })).creadoPor,
    ).toBe(sucesor.idUsuario);

    expect(
      await db.bitacoraAuditoria.count({
        where: { accion: 'LEADERSHIP_APPEAL_ACCEPTED', idObjeto: String(apelacion.idApelacion) },
      }),
    ).toBe(1);
    expect(
      await db.bitacoraAuditoria.count({
        where: { accion: 'LEADERSHIP_CHANGED', idObjeto: String(f.twin.idProyecto) },
      }),
    ).toBe(1);
    expect(
      await db.notificacion.count({
        where: { idUsuario: a, tipoNotificacion: 'APELACION_LIDERAZGO_RESUELTA' },
      }),
    ).toBe(1);
    expect(
      gateway.emitToUsers.mock.calls.filter((llamada) => llamada[0] === 'LEADERSHIP_CHANGED'),
    ).toHaveLength(1);

    // Segundo proyecto: la apelación existe, pero el liderazgo ya cambió y la
    // intención antigua no se aplica al líder nuevo.
    const vieja = await service.createAppeal(
      f.project.idProyecto,
      f.leaderSinParticipacion.idUsuario,
      {
        asunto: 'Apelación previa al cambio',
        mensaje: 'Se resolverá cuando el liderazgo ya haya cambiado.',
        idCandidatoPropuesto: f.elegible.idUsuario,
      },
    );
    await service.transfer(f.project.idProyecto, f.admin.idUsuario, {
      idLiderNuevo: f.elegible.idUsuario,
      expectedLeaderId: f.leaderSinParticipacion.idUsuario,
      motivo: 'Cambio administrativo previo a la aceptación tardía.',
    });
    await expectStatus(409, () =>
      service.transfer(
        f.project.idProyecto,
        f.admin.idUsuario,
        {
          idLiderNuevo: f.deshabilitado.idUsuario,
          expectedLeaderId: f.leaderSinParticipacion.idUsuario,
          motivo: 'Aceptación tardía con un líder esperado obsoleto.',
        },
        vieja.idApelacion,
      ),
    );
    expect(
      await db.historialLiderazgo.count({ where: { idProyecto: f.project.idProyecto } }),
    ).toBe(1);
  });

  it('T17: el exlíder con participación conserva sus filas, sus permisos de rol y su salida normal', async () => {
    const f = await leadershipFixture(db, scope);
    const { service } = leadershipStack(db);
    const { tasks, timeRecords } = tasksStack(db);
    const { service: exits } = exitStack(db);
    // A lidera el gemelo con DOS participaciones activas.
    const a = f.leaderConParticipacion.idUsuario;

    const sucesor = await createIntegrationUser(db);
    collectInto(scope, 'userIds', [sucesor.idUsuario]);
    const participacionSucesor = await createIntegrationParticipation(
      db,
      sucesor.idUsuario,
      f.twinRoleA.idRolProyecto,
      { estadoParticipacion: 'ACTIVO' },
    );
    collectInto(scope, 'participationIds', [participacionSucesor.idParticipacion]);

    const sprint = await createIntegrationSprint(db, f.twin.idProyecto, { estado: 'ACTIVO' });
    collectInto(scope, 'sprintIds', [sprint.idSprint]);
    const participacionesDeA = await db.participacionProyecto.findMany({
      where: {
        idUsuario: a,
        estadoParticipacion: 'ACTIVO',
        rolProyecto: { idProyecto: f.twin.idProyecto },
      },
      orderBy: { idRolProyecto: 'asc' },
    });
    expect(participacionesDeA).toHaveLength(2);

    const tareas = [];
    for (const participacion of participacionesDeA) {
      const tarea = await createIntegrationTask(db, f.twin.idProyecto, a, sprint.idSprint, {
        idRolProyecto: participacion.idRolProyecto,
      });
      collectInto(scope, 'taskIds', [tarea.idTarea]);
      const asignacion = await createIntegrationTaskAssignment(db, tarea.idTarea, a, a, {
        idParticipacion: participacion.idParticipacion,
      });
      collectInto(scope, 'assignmentIds', [asignacion.idAsignacion]);
      tareas.push({ tarea, asignacion });
    }
    await timeRecords.create(f.twin.idProyecto, tareas[0].tarea.idTarea, a, {
      horas: 3,
      fecha: '2026-09-05',
      nota: 'Trabajo previo al cambio de liderazgo',
    });

    // Foto exacta de todo lo que A tiene antes de perder el liderazgo.
    const filasDeA = async () => ({
      participaciones: await db.participacionProyecto.findMany({
        where: { idUsuario: a, rolProyecto: { idProyecto: f.twin.idProyecto } },
        orderBy: { idParticipacion: 'asc' },
      }),
      asignaciones: await db.asignacionTarea.findMany({
        where: { idUsuario: a, tarea: { idProyecto: f.twin.idProyecto } },
        orderBy: { idAsignacion: 'asc' },
      }),
      registros: await db.registroTiempoTarea.findMany({
        where: { idUsuario: a, asignacion: { tarea: { idProyecto: f.twin.idProyecto } } },
        orderBy: { idRegistroTiempo: 'asc' },
      }),
    });
    const antes = await filasDeA();

    const resultado = await service.transfer(f.twin.idProyecto, f.admin.idUsuario, {
      idLiderNuevo: sucesor.idUsuario,
      expectedLeaderId: a,
      motivo: 'Cambio de conducción acordado con el equipo.',
    });
    expect(resultado.salienteTieneParticipacionActiva).toBe(true);
    expect(resultado.efectoSaliente).toBe('INTEGRANTE_NORMAL');
    expect(
      (await db.proyecto.findUniqueOrThrow({ where: { idProyecto: f.twin.idProyecto } })).creadoPor,
    ).toBe(sucesor.idUsuario);

    // Ni una fila de A cambió: la transferencia no toca la membresía.
    expect(await filasDeA()).toEqual(antes);

    // Sigue siendo un integrante ordinario: reporta horas y cierra su tramo.
    const registro = await timeRecords.create(f.twin.idProyecto, tareas[1].tarea.idTarea, a, {
      horas: 2,
      fecha: '2026-09-06',
      nota: 'Trabajo posterior al cambio de liderazgo',
    });
    expect(Number(registro.horas)).toBe(2);
    await tasks.closeAssignment(
      f.twin.idProyecto,
      tareas[1].tarea.idTarea,
      tareas[1].asignacion.idAsignacion,
      a,
      {
        contenidoAvance:
          'Cierre del tramo con el detalle completo del trabajo realizado durante el Sprint, incluyendo el alcance cubierto, las decisiones tomadas, los pendientes que quedan para el siguiente ciclo y la evidencia asociada al avance reportado por el integrante.',
      },
    );
    const cerrado = await db.asignacionTarea.findUniqueOrThrow({
      where: { idAsignacion: tareas[1].asignacion.idAsignacion },
    });
    expect(cerrado.desasignadaEn).not.toBeNull();

    // La salida ordinaria le queda disponible ahora que no lidera.
    const salida = await exits.createSolicitudSalida(
      f.twin.idProyecto,
      a,
      'Dejo el proyecto tras entregar el liderazgo.',
    );
    collectInto(scope, 'exitRequestIds', [salida.idSolicitud]);
    expect(salida.estadoSolicitud).toBe('PREPARACION');

    // No conserva ningún permiso de líder: no puede transferir el liderazgo.
    await expectStatus(403, () =>
      service.transfer(f.twin.idProyecto, a, {
        idLiderNuevo: f.leaderSinParticipacion.idUsuario,
        expectedLeaderId: sucesor.idUsuario,
        motivo: 'Intento de un exlíder que ya no manda.',
      }),
    );
    await expectStatus(403, () =>
      service.createAppeal(f.twin.idProyecto, a, {
        asunto: 'Intento de apelación de un exlíder',
        mensaje: 'Ya no es el líder actual del proyecto.',
        idCandidatoPropuesto: f.leaderSinParticipacion.idUsuario,
      }),
    );
  });
});
