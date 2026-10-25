import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import type { PrismaClient, TipoNotificacion } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import { createIntegrationProject, createIntegrationUser } from './setup/fixtures';
import { cleanupIntegrationFixtures } from './setup/cleanup';
import { startIntegrationHttpHarness, type IntegrationHttpHarness } from './setup/http-harness';
import { NotificationsController } from '../../src/notifications/notifications.controller';
import { NotificationsService } from '../../src/notifications/notifications.service';
import type { NotificationsGateway } from '../../src/notifications/notifications.gateway';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { getJwtSecret } from '../../src/config/jwt-secret';
import { ListNotificationsQueryDto, NotificationTypesFilterDto } from '../../src/notifications/dto/list-notifications-query.dto';

/**
 * HU-198 (G12/G13, T-370 backend): filtros de GET /api/notificaciones y marcado
 * acotado de PATCH /api/notificaciones/leer-todas, con el controlador, la
 * JwtStrategy y el ValidationPipe reales contra PostgreSQL desechable.
 */
describeIntegration('HU-198 — filtros y marcado filtrado de notificaciones (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let harness: IntegrationHttpHarness;
  const scope = { userIds: [] as number[], projectIds: [] as number[] };
  const ids = { a: 0, b: 0, proyecto: 0 };
  const tokens = { a: '', b: '' };
  const BASE = new Date('2031-01-10T12:00:00.000Z');

  const pedir = async (metodo: string, ruta: string, token?: string) => {
    const res = await fetch(`${harness.url}${ruta}`, { method: metodo, headers: token ? { cookie: `access_token=${token}` } : {} });
    const texto = await res.text();
    return { status: res.status, body: texto ? JSON.parse(texto) : null };
  };
  const sembrar = async () => {
    await prisma.notificacion.deleteMany({ where: { idUsuario: { in: [ids.a, ids.b] } } });
    const fila = (idUsuario: number, tipo: TipoNotificacion, minutos: number, leida = false, datosJson?: object, mensaje?: string) => ({
      idUsuario, tipoNotificacion: tipo, tituloNotificacion: `${tipo} ${minutos}`, mensajeNotificacion: mensaje ?? null, creadaEn: new Date(BASE.getTime() + minutos * 60_000), leidaEn: leida ? BASE : null,
      ...(datosJson ? { datosJson } : {}),
    });
    await prisma.notificacion.createMany({
      data: [
        // Sprint 10: payloads con proyecto (projectId e idProyecto) y mensajes para la búsqueda.
        fila(ids.a, 'TAREA_ASIGNADA', 1, false, { projectId: ids.proyecto }, 'Revisa las HORAS del sprint'),
        fila(ids.a, 'TAREA_ASIGNADA', 2, false, { idProyecto: ids.proyecto }),
        fila(ids.a, 'TAREA_ASIGNADA', 3, true, { projectId: 999_999_999 }),
        fila(ids.a, 'TAREA_POR_VENCER', 4), fila(ids.a, 'MENCION_COMENTARIO', 5), fila(ids.a, 'REUNION_PROGRAMADA', 6),
        // Empate de creadaEn: desempata idNotificacion desc.
        fila(ids.a, 'NUEVO_SEGUIDOR', 7), fila(ids.a, 'NUEVO_SEGUIDOR', 7),
        fila(ids.b, 'TAREA_ASIGNADA', 1), fila(ids.b, 'MENCION_COMENTARIO', 2),
      ],
    });
  };

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
    const gateway = { server: {}, notifyUsers: async () => undefined } as unknown as NotificationsGateway;
    harness = await startIntegrationHttpHarness({
      prisma,
      controllers: [{
        controller: NotificationsController,
        deps: [NotificationsService],
        handlers: { findAll: [Object, ListNotificationsQueryDto], markAllAsRead: [Object, NotificationTypesFilterDto] },
      }],
      providers: [{ provide: NotificationsService, useValue: new NotificationsService(prisma as unknown as PrismaService, gateway) }],
    });
    const a = await createIntegrationUser(prisma, { nombre: 'A', apellido: 'HU198' });
    const b = await createIntegrationUser(prisma, { nombre: 'B', apellido: 'HU198' });
    scope.userIds.push(a.idUsuario, b.idUsuario);
    const proyecto = await createIntegrationProject(prisma, a.idUsuario, { tituloProyecto: 'Bandeja S10' });
    scope.projectIds.push(proyecto.idProyecto);
    Object.assign(ids, { a: a.idUsuario, b: b.idUsuario, proyecto: proyecto.idProyecto });
    const jwt = new JwtService({ secret: getJwtSecret() });
    tokens.a = jwt.sign({ sub: a.idUsuario, correo: a.correo, tipo: 'access' });
    tokens.b = jwt.sign({ sub: b.idUsuario, correo: b.correo, tipo: 'access' });
  }, 60_000);

  beforeEach(sembrar);

  afterAll(async () => {
    try {
      await prisma.notificacion.deleteMany({ where: { idUsuario: { in: scope.userIds } } });
      await cleanupIntegrationFixtures(prisma, scope);
    } finally {
      await harness?.close();
      await prisma.$disconnect();
    }
  });

  it('AC-23: tipos + leida filtran data y total juntos, solo del usuario de la sesión', async () => {
    const res = await pedir('GET', '/notificaciones?page=1&limit=2&tipos=TAREA_ASIGNADA,TAREA_POR_VENCER&leida=false', tokens.a);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 3, page: 1, totalPages: 2 });
    expect(res.body.data.map((n: { tituloNotificacion: string }) => n.tituloNotificacion)).toEqual(['TAREA_POR_VENCER 4', 'TAREA_ASIGNADA 2']);
    const pagina2 = await pedir('GET', '/notificaciones?page=2&limit=2&tipos=TAREA_ASIGNADA,TAREA_POR_VENCER&leida=false', tokens.a);
    expect(pagina2.body.data.map((n: { tituloNotificacion: string }) => n.tituloNotificacion)).toEqual(['TAREA_ASIGNADA 1']);
  });

  it('leida=true trae solo leídas; tipos repetido (tipos=A&tipos=B) también funciona; sin filtros, todo como antes', async () => {
    expect((await pedir('GET', '/notificaciones?page=1&leida=true', tokens.a)).body).toMatchObject({ total: 1, data: [{ tituloNotificacion: 'TAREA_ASIGNADA 3' }] });
    expect((await pedir('GET', '/notificaciones?page=1&tipos=MENCION_COMENTARIO&tipos=REUNION_PROGRAMADA', tokens.a)).body.total).toBe(2);
    expect((await pedir('GET', '/notificaciones?page=1', tokens.a)).body.total).toBe(8);
    // Sin page (lista de siempre) el filtro también aplica.
    expect((await pedir('GET', '/notificaciones?tipos=MENCION_COMENTARIO', tokens.a)).body).toHaveLength(1);
  });

  it('orden estable: creadaEn desc y, en empate, idNotificacion desc', async () => {
    const res = await pedir('GET', '/notificaciones?page=1&tipos=NUEVO_SEGUIDOR', tokens.a);
    const idsVistos = res.body.data.map((n: { idNotificacion: number }) => n.idNotificacion);
    expect(idsVistos).toEqual([...idsVistos].sort((x: number, y: number) => y - x));
  });

  it('AC-24: tipo desconocido, tipos vacío, leida no estricta o idUsuario en la query → 400 (nunca 500); sin sesión → 401', async () => {
    for (const query of ['tipos=NO_EXISTE', 'tipos=', 'leida=1', 'leida=FALSE', `idUsuario=${ids.b}`, 'page=0', 'limit=51']) {
      expect((await pedir('GET', `/notificaciones?page=1&${query}`, tokens.a)).status, query).toBe(400);
    }
    expect((await pedir('PATCH', '/notificaciones/leer-todas?tipos=NO_EXISTE', tokens.a)).status).toBe(400);
    expect((await pedir('GET', '/notificaciones?page=1')).status).toBe(401);
    expect((await pedir('PATCH', '/notificaciones/leer-todas')).status).toBe(401);
  });

  it('AC-25: marcar con tipos solo afecta esa categoría del usuario; las demás y las de otros quedan intactas', async () => {
    const res = await pedir('PATCH', '/notificaciones/leer-todas?tipos=TAREA_ASIGNADA,TAREA_POR_VENCER', tokens.a);
    expect(res).toMatchObject({ status: 200, body: { actualizadas: 3 } });
    const sinLeerA = await prisma.notificacion.findMany({ where: { idUsuario: ids.a, leidaEn: null }, select: { tipoNotificacion: true } });
    expect(sinLeerA.map((n) => n.tipoNotificacion).sort()).toEqual(['MENCION_COMENTARIO', 'NUEVO_SEGUIDOR', 'NUEVO_SEGUIDOR', 'REUNION_PROGRAMADA']);
    expect(await prisma.notificacion.count({ where: { idUsuario: ids.b, leidaEn: null } })).toBe(2);
    // Idempotente: repetir no cuenta las ya leídas.
    expect((await pedir('PATCH', '/notificaciones/leer-todas?tipos=TAREA_ASIGNADA', tokens.a)).body).toEqual({ actualizadas: 0 });
  });

  it('AC-26: sin tipos marca todas las propias, como siempre', async () => {
    expect((await pedir('PATCH', '/notificaciones/leer-todas', tokens.a)).body).toEqual({ actualizadas: 7 });
    expect(await prisma.notificacion.count({ where: { idUsuario: ids.a, leidaEn: null } })).toBe(0);
    expect(await prisma.notificacion.count({ where: { idUsuario: ids.b, leidaEn: null } })).toBe(2);
  });

  // ── Sprint 10 · bandeja: q, proyecto, orden y mias/proyectos ─────────────
  it('q busca en título y mensaje, parcial y sin mayúsculas, dentro del mismo filtro que data y total', async () => {
    const res = await pedir('GET', '/notificaciones?page=1&q=horas', tokens.a);
    expect(res.body).toMatchObject({ total: 1, data: [{ tituloNotificacion: 'TAREA_ASIGNADA 1' }] });
    expect((await pedir('GET', '/notificaciones?page=1&q=tarea_asig&leida=false', tokens.a)).body.total).toBe(2);
    expect((await pedir('GET', '/notificaciones?page=1&q=tarea_asig', tokens.b)).body.total).toBe(1);
    expect((await pedir('GET', `/notificaciones?page=1&q=${'x'.repeat(121)}`, tokens.a)).status).toBe(400);
  });

  it('proyecto=<id> acepta projectId e idProyecto del payload; proyecto=ninguno solo avisos sin proyecto', async () => {
    const conProyecto = await pedir('GET', `/notificaciones?page=1&proyecto=${ids.proyecto}`, tokens.a);
    expect(conProyecto.body.total).toBe(2);
    expect(conProyecto.body.data.map((n: { tituloNotificacion: string }) => n.tituloNotificacion)).toEqual(['TAREA_ASIGNADA 2', 'TAREA_ASIGNADA 1']);
    const sinProyecto = await pedir('GET', '/notificaciones?page=1&proyecto=ninguno', tokens.a);
    expect(sinProyecto.body.total).toBe(5);
    for (const valor of ['0', 'abc', '']) expect((await pedir('GET', `/notificaciones?page=1&proyecto=${valor}`, tokens.a)).status, valor).toBe(400);
  });

  it('orden=asc es el reverso exacto de la lista por defecto', async () => {
    const desc = (await pedir('GET', '/notificaciones?page=1&limit=50', tokens.a)).body.data.map((n: { idNotificacion: number }) => n.idNotificacion);
    const asc = (await pedir('GET', '/notificaciones?page=1&limit=50&orden=asc', tokens.a)).body.data.map((n: { idNotificacion: number }) => n.idNotificacion);
    expect(asc).toEqual([...desc].reverse());
    expect((await pedir('GET', '/notificaciones?page=1&orden=DESC', tokens.a)).status).toBe(400);
  });
});
