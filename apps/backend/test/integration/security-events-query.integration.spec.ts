import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { PARAMTYPES_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { createIntegrationUser } from './setup/fixtures';
import { accessTokenFor, requestJson, startIntegrationHttpHarness, type IntegrationHttpHarness } from './setup/http-harness';
import { cleanupLeadershipFixture, createIntegrationAdmin, type LeadershipCleanupScope } from './setup/leadership';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { ProjectPolicyService } from '../../src/common/project-policy/project-policy.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { accountReference } from '../../src/security-events/account-reference';
import { ListSecurityEventsQueryDto } from '../../src/security-events/dto/list-security-events-query.dto';
import { SecurityEventsController } from '../../src/security-events/security-events.controller';
import { SecurityEventsQueryService } from '../../src/security-events/security-events-query.service';
import { SecurityEventsService, type SecurityEventInput } from '../../src/security-events/security-events.service';
import { TIPO_OBJETO_SEGURIDAD, TipoEventoSeguridad } from '../../src/security-events/tipos-evento-seguridad';

/**
 * FG01 (T-310): visor administrativo de eventos de seguridad contra
 * PostgreSQL real, con las migraciones del repositorio aplicadas.
 */
describeIntegration('FG01-C06 — índice de la línea de tiempo de seguridad (PostgreSQL real)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('la migración crea el índice con el filtro fijo y el orden de la paginación', async () => {
    const indices = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname = 'bitacora_auditoria_tipo_objeto_fecha_evento_id_auditoria_idx'`;
    expect(indices).toHaveLength(1);
    expect(indices[0].indexdef).toMatch(/USING btree \(tipo_objeto, fecha_evento DESC, id_auditoria DESC\)$/);
  });

  it('el índice funcional de la bitácora de proyectos sigue existiendo', async () => {
    const indices = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = current_schema() AND tablename = 'bitacora_auditoria'
      ORDER BY indexname`;
    expect(indices.map((indice) => indice.indexname)).toEqual([
      'bitacora_auditoria_id_proyecto_fecha_idx',
      'bitacora_auditoria_pkey',
      'bitacora_auditoria_tipo_objeto_fecha_evento_id_auditoria_idx',
    ]);
  });

  it('la migración es aditiva y reintentable: solo un CREATE INDEX IF NOT EXISTS', async () => {
    const sql = readFileSync(
      join(__dirname, '../../prisma/migrations/20261011120000_security_audit_timeline/migration.sql'),
      'utf8',
    );
    const sentencias = sql
      .split('\n')
      .filter((linea) => !linea.trimStart().startsWith('--'))
      .join('\n')
      .split(';')
      .map((sentencia) => sentencia.trim())
      .filter(Boolean);
    expect(sentencias).toHaveLength(1);
    expect(sentencias[0]).toMatch(/^CREATE INDEX IF NOT EXISTS "bitacora_auditoria_tipo_objeto_fecha_evento_id_auditoria_idx"/);
    await expect(prisma.$executeRawUnsafe(sentencias[0])).resolves.toBeDefined();
  });
});

/**
 * FG01-C07 (T-310). `GET /api/admin/eventos-seguridad` por HTTP real contra
 * PostgreSQL, sobre eventos escritos por el writer REAL
 * (`SecurityEventsService.record`), con el detalle que escriben hoy sus
 * productores más claves que nunca deben salir.
 *
 * El writer fecha cada evento con `now()`. Para probar rangos, empates y
 * orden, la suite mueve SUS filas a una ventana propia en el pasado y todas
 * las consultas se acotan a esa ventana: el resultado no depende de qué más
 * haya en la base.
 */
describeIntegration('FG01-C07 — visor de eventos de seguridad sobre el writer real (PostgreSQL real)', () => {
  const SECRETOS = ['tok-secreto-fg01', 'clave-secreta-fg01', 'intento-secreto@example.test', 'https://uvg.test/reset?token='];
  // Ventana propia de esta ejecución: un día de 2001 elegido al azar.
  const BASE = Date.UTC(2001, 0, 1) + Math.floor(Math.random() * 300) * 86_400_000;
  const minuto = (n: number) => new Date(BASE + n * 60_000);
  const VENTANA = `desde=${encodeURIComponent(minuto(0).toISOString())}&hasta=${encodeURIComponent(minuto(60).toISOString())}`;

  let prisma: PrismaClient;
  let http: IntegrationHttpHarness;
  let writer: SecurityEventsService;
  const scope: LeadershipCleanupScope = {};
  const tokens = { admin: '', estudiante: '' };
  const ids = { admin: 0, estudiante: 0, afectada: 0, eliminada: 0 };
  /** idAuditoria de e1..e8, en el orden en que se registraron. */
  const e: number[] = [];
  const ruido: number[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Evento = any;
  const pedir = (consulta = '', token: string | undefined = tokens.admin) =>
    requestJson(`${http.url}/admin/eventos-seguridad?${VENTANA}${consulta}`, { token });
  const idsDe = (body: { data: Evento[] }) => body.data.map((evento: Evento) => evento.id);
  const evento = (body: { data: Evento[] }, id: number) => body.data.find((candidato: Evento) => candidato.id === id);

  /** Registra con el writer real y mueve la fila recién creada al minuto indicado de la ventana. */
  async function registrar(input: SecurityEventInput, n: number): Promise<void> {
    expect(await writer.record(input)).toBe(true);
    const fila = await prisma.bitacoraAuditoria.findFirstOrThrow({
      where: { tipoObjeto: TIPO_OBJETO_SEGURIDAD, accion: input.tipo },
      orderBy: { idAuditoria: 'desc' },
      select: { idAuditoria: true },
    });
    await prisma.bitacoraAuditoria.update({ where: { idAuditoria: fila.idAuditoria }, data: { fechaEvento: minuto(n) } });
    e.push(fila.idAuditoria);
  }

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    writer = new SecurityEventsService(prisma as unknown as PrismaService);

    const admin = await createIntegrationAdmin(prisma, scope);
    const estudiante = await createIntegrationUser(prisma);
    const afectada = await createIntegrationUser(prisma, { nombre: 'Eva', apellido: 'Afectada' });
    const eliminada = await createIntegrationUser(prisma);
    scope.userIds = [...(scope.userIds ?? []), estudiante.idUsuario, afectada.idUsuario];
    Object.assign(ids, {
      admin: admin.idUsuario,
      estudiante: estudiante.idUsuario,
      afectada: afectada.idUsuario,
      eliminada: eliminada.idUsuario,
    });
    tokens.admin = accessTokenFor(admin);
    tokens.estudiante = accessTokenFor(estudiante);

    const directo = { ip: '203.0.113.9', ipTrusted: false };
    const trasProxy = { ip: '198.51.100.7', ipTrusted: true };
    // e1: login fallido contra una cuenta que no existe, con claves que jamás deben salir.
    await registrar(
      {
        tipo: TipoEventoSeguridad.LOGIN_FAILED,
        origen: directo,
        idUsuarioAfectado: null,
        detalle: {
          motivo: 'CREDENCIALES',
          cuentaConocida: false,
          cuentaRef: accountReference(SECRETOS[2]),
          correoIntentado: SECRETOS[2],
          token: SECRETOS[0],
          password: SECRETOS[1],
          anidado: { secret: SECRETOS[1], lista: [SECRETOS[0]] },
        },
      },
      1,
    );
    await registrar(
      {
        tipo: TipoEventoSeguridad.LOGIN_FAILED,
        origen: directo,
        idUsuarioAfectado: ids.afectada,
        detalle: { motivo: 'CREDENCIALES', cuentaConocida: true },
      },
      2,
    );
    await registrar(
      { tipo: TipoEventoSeguridad.ACCOUNT_LOCKED, origen: directo, idUsuarioAfectado: ids.afectada, detalle: { cuentaConocida: true } },
      3,
    );
    await registrar(
      {
        tipo: TipoEventoSeguridad.USER_STATUS_CHANGED,
        origen: trasProxy,
        idActor: ids.admin,
        idUsuarioAfectado: ids.afectada,
        detalle: { estadoAnterior: 'ACTIVO', estadoNuevo: 'BLOQUEADO' },
      },
      4,
    );
    // e5 y e6 comparten instante: solo idAuditoria los ordena.
    await registrar(
      {
        tipo: TipoEventoSeguridad.PASSWORD_RESET_ISSUED,
        origen: trasProxy,
        idActor: ids.admin,
        idUsuarioAfectado: ids.afectada,
        detalle: {
          idSolicitud: 77,
          expiraEn: '2001-06-01T00:00:00.000Z',
          resetUrl: `${SECRETOS[3]}${SECRETOS[0]}`,
          resetToken: SECRETOS[0],
        },
      },
      5,
    );
    await registrar(
      {
        tipo: TipoEventoSeguridad.PASSWORD_RESET_COMPLETED,
        origen: directo,
        idActor: ids.afectada,
        idUsuarioAfectado: ids.afectada,
        detalle: { idSolicitud: 77, sesionesRevocadas: 2 },
      },
      5,
    );
    await registrar(
      { tipo: TipoEventoSeguridad.LOGIN_SUCCEEDED, origen: directo, idActor: ids.afectada, idUsuarioAfectado: ids.afectada },
      7,
    );
    await registrar(
      {
        tipo: TipoEventoSeguridad.USER_STATUS_CHANGED,
        origen: directo,
        idActor: ids.admin,
        idUsuarioAfectado: ids.eliminada,
        detalle: { estadoAnterior: 'ACTIVO', estadoNuevo: 'INACTIVO' },
      },
      8,
    );
    await prisma.usuario.delete({ where: { idUsuario: ids.eliminada } });

    // Filas de la misma tabla y la misma ventana que NO son eventos de seguridad del catálogo.
    for (const [accion, tipoObjeto] of [
      ['TASK_CREATED', 'TAREA'],
      ['LOGIN_FAILED', 'TAREA'],
      ['EVENTO_FUERA_DE_CATALOGO', TIPO_OBJETO_SEGURIDAD],
    ]) {
      const fila = await prisma.bitacoraAuditoria.create({
        data: {
          accion,
          tipoObjeto,
          idUsuario: ids.admin,
          idObjeto: String(ids.afectada),
          detalleJson: { idProyecto: 1, token: SECRETOS[0] },
          fechaEvento: minuto(6),
        },
      });
      ruido.push(fila.idAuditoria);
    }

    // Lo que `emitDecoratorMetadata` genera en el build real.
    Reflect.defineMetadata(PARAMTYPES_METADATA, [Reflector, PrismaService], RolesGuard);
    http = await startIntegrationHttpHarness({
      prisma,
      controllers: [
        {
          controller: SecurityEventsController,
          deps: [SecurityEventsQueryService],
          handlers: { list: [Object, ListSecurityEventsQueryDto] },
        },
      ],
      providers: [
        {
          provide: SecurityEventsQueryService,
          useValue: new SecurityEventsQueryService(prisma as unknown as PrismaService, new ProjectPolicyService({} as never)),
        },
      ],
    });
  });

  afterAll(async () => {
    await http?.close();
    await prisma.bitacoraAuditoria.deleteMany({ where: { idAuditoria: { in: [...e, ...ruido] } } });
    await cleanupLeadershipFixture(prisma, scope);
    await prisma.$disconnect();
  });

  it('sin sesión -> 401 y estudiante -> 403, sin datos', async () => {
    const anonimo = await pedir('', '');
    expect(anonimo.status).toBe(401);
    expect(anonimo.body).not.toHaveProperty('data');

    const estudiante = await pedir('', tokens.estudiante);
    expect(estudiante.status).toBe(403);
    expect(estudiante.body.message).toBe('Acceso restringido a administradores');
    expect(estudiante.body).not.toHaveProperty('data');
  });

  it('el administrador lee los ocho eventos, del más reciente al más antiguo, con el catálogo real', async () => {
    const { status, body } = await pedir();
    expect(status).toBe(200);
    expect(body).toMatchObject({ total: 8, page: 1, totalPages: 1 });
    // e6 y e5 empatan en fecha: gana el idAuditoria mayor.
    expect(idsDe(body)).toEqual([e[7], e[6], e[5], e[4], e[3], e[2], e[1], e[0]]);
    expect(body.tipos).toEqual([...TipoEventoSeguridad.VALORES]);
  });

  it('nunca salen filas de otra área ni acciones fuera del catálogo, aunque compartan tabla, ventana y cuenta', async () => {
    const { body } = await pedir(`&idUsuario=${ids.afectada}`);
    expect(idsDe(body).some((id: number) => ruido.includes(id))).toBe(false);
    expect(body.data.every((candidato: Evento) => TipoEventoSeguridad.VALORES.includes(candidato.tipo))).toBe(true);
    expect((await pedir('&tipo=TASK_CREATED')).status).toBe(400);
  });

  it('la respuesta no contiene secretos, correos intentados ni el JSON crudo', async () => {
    const { body } = await pedir();
    const json = JSON.stringify(body);
    for (const secreto of SECRETOS) expect(json).not.toContain(secreto);
    for (const clave of ['detalleJson', 'token', 'password', 'secret', 'correo', 'resetUrl', 'anidado', 'ipTrusted', 'contrasena']) {
      expect(json).not.toContain(`"${clave}`);
    }
    for (const candidato of body.data) {
      expect(Object.keys(candidato).sort()).toEqual(['actor', 'cuenta', 'detalle', 'fecha', 'id', 'origen', 'tipo']);
    }
  });

  it('un login fallido contra una cuenta inexistente sale sin actor ni cuenta, solo con su referencia seudónima', async () => {
    const { body } = await pedir();
    expect(evento(body, e[0])).toEqual({
      id: e[0],
      tipo: 'LOGIN_FAILED',
      fecha: minuto(1).toISOString(),
      actor: null,
      cuenta: null,
      origen: { ip: '203.0.113.9', ipConfiable: false },
      detalle: { motivo: 'CREDENCIALES', cuentaConocida: false, cuentaRef: accountReference(SECRETOS[2]) },
    });
  });

  it('actor, cuenta afectada, origen y detalle de cada tipo salen como los escribió su productor', async () => {
    const { body } = await pedir();
    const admin = { idUsuario: ids.admin, nombre: 'Integration User' };
    const afectada = { idUsuario: ids.afectada, nombre: 'Eva Afectada' };
    expect(evento(body, e[1])).toMatchObject({ actor: null, cuenta: afectada, detalle: { motivo: 'CREDENCIALES', cuentaConocida: true } });
    expect(evento(body, e[2])).toMatchObject({ tipo: 'ACCOUNT_LOCKED', actor: null, cuenta: afectada, detalle: { cuentaConocida: true } });
    expect(evento(body, e[3])).toMatchObject({
      tipo: 'USER_STATUS_CHANGED',
      actor: admin,
      cuenta: afectada,
      origen: { ip: '198.51.100.7', ipConfiable: true },
      detalle: { estadoAnterior: 'ACTIVO', estadoNuevo: 'BLOQUEADO' },
    });
    expect(evento(body, e[4]).detalle).toEqual({ idSolicitud: 77, expiraEn: '2001-06-01T00:00:00.000Z' });
    expect(evento(body, e[5])).toMatchObject({ actor: afectada, cuenta: afectada, detalle: { idSolicitud: 77, sesionesRevocadas: 2 } });
    expect(evento(body, e[6])).toMatchObject({ tipo: 'LOGIN_SUCCEEDED', actor: afectada, cuenta: afectada, detalle: {} });
  });

  it('una cuenta eliminada después del evento conserva su id y sale sin nombre', async () => {
    const { body } = await pedir();
    expect(evento(body, e[7])).toMatchObject({
      actor: { idUsuario: ids.admin },
      cuenta: { idUsuario: ids.eliminada, nombre: null },
      detalle: { estadoAnterior: 'ACTIVO', estadoNuevo: 'INACTIVO' },
    });
  });

  it('filtra por tipo, por persona (actor o cuenta afectada) y por ambos', async () => {
    expect(idsDe((await pedir('&tipo=LOGIN_FAILED')).body)).toEqual([e[1], e[0]]);
    expect(idsDe((await pedir(`&idUsuario=${ids.afectada}`)).body)).toEqual([e[6], e[5], e[4], e[3], e[2], e[1]]);
    expect(idsDe((await pedir(`&idUsuario=${ids.admin}`)).body)).toEqual([e[7], e[4], e[3]]);
    expect(idsDe((await pedir(`&idUsuario=${ids.eliminada}`)).body)).toEqual([e[7]]);
    const combinado = await pedir(`&tipo=USER_STATUS_CHANGED&idUsuario=${ids.afectada}`);
    expect(idsDe(combinado.body)).toEqual([e[3]]);
    expect(combinado.body).toMatchObject({ total: 1, totalPages: 1 });
  });

  it('el rango de fechas incluye ambos extremos y entiende otra zona horaria', async () => {
    const rango = (desde: string, hasta: string) =>
      requestJson(
        `${http.url}/admin/eventos-seguridad?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`,
        { token: tokens.admin },
      );
    const utc = await rango(minuto(3).toISOString(), minuto(5).toISOString());
    expect(idsDe(utc.body)).toEqual([e[5], e[4], e[3], e[2]]);

    // Los mismos instantes escritos con el desplazamiento de Guatemala.
    const guatemala = (fecha: Date) => `${new Date(fecha.getTime() - 6 * 3_600_000).toISOString().slice(0, -1)}-06:00`;
    const local = await rango(guatemala(minuto(3)), guatemala(minuto(5)));
    expect(idsDe(local.body)).toEqual([e[5], e[4], e[3], e[2]]);

    const unMilisegundoAntes = await rango(minuto(3).toISOString(), new Date(minuto(5).getTime() - 1).toISOString());
    expect(idsDe(unMilisegundoAntes.body)).toEqual([e[3], e[2]]);
  });

  it('pagina sin saltos ni repeticiones, también a través del empate de fecha', async () => {
    const paginas = await Promise.all([1, 2, 3].map((page) => pedir(`&limit=3&page=${page}`)));
    expect(paginas.map(({ body }) => idsDe(body))).toEqual([
      [e[7], e[6], e[5]],
      [e[4], e[3], e[2]],
      [e[1], e[0]],
    ]);
    for (const { body } of paginas) expect(body).toMatchObject({ total: 8, totalPages: 3 });

    const deUnoEnUno: number[] = [];
    for (let page = 1; page <= 8; page += 1) deUnoEnUno.push(...idsDe((await pedir(`&limit=1&page=${page}`)).body));
    expect(deUnoEnUno).toEqual([e[7], e[6], e[5], e[4], e[3], e[2], e[1], e[0]]);
  });

  it('una página más allá de la última viene vacía con el total real', async () => {
    const { status, body } = await pedir('&limit=3&page=4');
    expect(status).toBe(200);
    expect(body).toMatchObject({ data: [], total: 8, page: 4, totalPages: 3 });
  });

  it('leer no escribe: el visor no crea, modifica ni borra filas de la bitácora', async () => {
    const foto = () =>
      prisma.bitacoraAuditoria.findMany({
        where: { OR: [{ fechaEvento: { gte: minuto(0), lte: minuto(60) } }, { idUsuario: { in: [ids.admin, ids.estudiante] } }] },
        orderBy: { idAuditoria: 'asc' },
      });
    const antes = await foto();
    await pedir();
    await pedir('&tipo=LOGIN_FAILED&limit=1');
    await pedir('', tokens.estudiante);
    await pedir('&tipo=NO_EXISTE');
    expect(await foto()).toEqual(antes);
    expect(antes).toHaveLength(e.length + ruido.length);
  });

  it('el writer sigue siendo best-effort: si no puede guardar devuelve false y no lanza', async () => {
    const roto = { bitacoraAuditoria: { create: () => Promise.reject(new Error('almacenamiento caído')) } };
    const writerRoto = new SecurityEventsService(roto as unknown as PrismaService);
    vi.spyOn((writerRoto as unknown as { logger: { warn: () => void } }).logger, 'warn').mockImplementation(() => undefined);
    await expect(writerRoto.record({ tipo: TipoEventoSeguridad.LOGIN_FAILED })).resolves.toBe(false);
  });

  it('perder el rol o la cuenta corta el acceso aunque el token siga vigente', async () => {
    const rol = await prisma.usuarioRolAcceso.findFirstOrThrow({ where: { idUsuario: ids.admin } });
    await prisma.usuarioRolAcceso.delete({ where: { idUsuarioRolAcceso: rol.idUsuarioRolAcceso } });
    try {
      expect((await pedir()).status).toBe(403);
    } finally {
      await prisma.usuarioRolAcceso.create({ data: { idUsuario: ids.admin, idRolAcceso: rol.idRolAcceso } });
    }
    expect((await pedir()).status).toBe(200);

    await prisma.usuario.update({ where: { idUsuario: ids.admin }, data: { estado: 'BLOQUEADO' } });
    try {
      expect((await pedir()).status).toBe(401);
    } finally {
      await prisma.usuario.update({ where: { idUsuario: ids.admin }, data: { estado: 'ACTIVO' } });
    }
    expect((await pedir()).status).toBe(200);
  });
});
