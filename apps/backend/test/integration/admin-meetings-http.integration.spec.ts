import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PARAMTYPES_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import { cleanupIntegrationFixtures } from './setup/cleanup';
import { startIntegrationHttpHarness, type IntegrationHttpHarness } from './setup/http-harness';
import { cleanupAdminMeetings, escenarioReuniones, notificacionesConGatewayFalso } from './setup/admin-meetings';
import { AdminMeetingsController } from '../../src/events/admin-meetings.controller';
import { AdminMeetingsService } from '../../src/events/admin-meetings.service';
import { EventsController } from '../../src/events/events.controller';
import { EventsService } from '../../src/events/events.service';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { getJwtSecret } from '../../src/config/jwt-secret';
import { CreateAdminMeetingDto } from '../../src/events/dto/create-admin-meeting.dto';
import { UpdateAdminMeetingDto } from '../../src/events/dto/update-admin-meeting.dto';
import { UpdateEventDto } from '../../src/events/dto/update-event.dto';
import { EligibleMeetingProjectsQueryDto, ListAdminMeetingsQueryDto } from '../../src/events/dto/admin-meetings-query.dto';

/**
 * HU-195 (G08, T-362/T-365): contrato HTTP real de /api/admin/reuniones —
 * NestFactory, JwtAuthGuard + JwtStrategy, RolesGuard (rol en BD) y el
 * ValidationPipe de main.ts — contra PostgreSQL desechable. Incluye el 403 del
 * líder por la ruta ordinaria de eventos.
 */
describeIntegration('HU-195 G08 — API HTTP de reuniones de Administración (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let harness: IntegrationHttpHarness;
  const scope = { userIds: [] as number[], projectIds: [] as number[], roleIds: [] as number[], participationIds: [] as number[] };
  let esc: Awaited<ReturnType<typeof escenarioReuniones>>;
  const tokens: Record<string, string> = {};

  const pedir = async (metodo: string, ruta: string, quien?: string, cuerpo?: unknown) => {
    const res = await fetch(`${harness.url}${ruta}`, {
      method: metodo,
      headers: { ...(quien ? { cookie: `access_token=${tokens[quien]}` } : {}), 'content-type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const texto = await res.text();
    return { status: res.status, texto, body: texto ? JSON.parse(texto) : null };
  };
  const cuerpo = (proyectos: number[], extra: Record<string, unknown> = {}) => ({
    tituloEvento: 'Reunión HTTP',
    fechaInicio: esc.enDias(8).toISOString(),
    fechaFin: esc.enDias(8, 16).toISOString(),
    modalidad: 'VIRTUAL',
    linkSesion: 'https://meet.google.com/abc-defg-hij',
    proyectos,
    ...extra,
  });

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
    esc = await escenarioReuniones(prisma, scope);
    const { notifications } = notificacionesConGatewayFalso(prisma);
    const servicio = new AdminMeetingsService(prisma as unknown as PrismaService, notifications);
    if (!Reflect.getMetadata(PARAMTYPES_METADATA, RolesGuard)) Reflect.defineMetadata(PARAMTYPES_METADATA, [Reflector, PrismaService], RolesGuard);
    harness = await startIntegrationHttpHarness({
      prisma,
      controllers: [
        {
          controller: AdminMeetingsController,
          deps: [AdminMeetingsService],
          handlers: {
            list: [Object, ListAdminMeetingsQueryDto],
            eligibleProjects: [EligibleMeetingProjectsQueryDto],
            detail: [Number, Object],
            participants: [Number],
            create: [Object, CreateAdminMeetingDto],
            update: [Number, Object, UpdateAdminMeetingDto],
            cancel: [Number, Object],
          },
        },
        { controller: EventsController, deps: [EventsService], handlers: { update: [Number, Number, Object, UpdateEventDto], remove: [Number, Number, Object] } },
      ],
      providers: [
        { provide: AdminMeetingsService, useValue: servicio },
        { provide: EventsService, useValue: new EventsService(prisma as unknown as PrismaService) },
      ],
    });
    const jwt = new JwtService({ secret: getJwtSecret() });
    for (const clave of ['ADMIN', 'ADMIN2', 'ESTUDIANTE', 'L1', 'INACT'] as const) {
      const u = esc.u[clave];
      tokens[clave] = jwt.sign({ sub: u.idUsuario, correo: u.correo, tipo: 'access' });
    }
  }, 60_000);

  afterAll(async () => {
    try {
      await cleanupAdminMeetings(prisma, scope);
      await cleanupIntegrationFixtures(prisma, scope);
    } finally {
      await harness?.close();
      await prisma.$disconnect();
    }
  });

  describe('AC-10: autenticación y rol', () => {
    it('sin sesión → 401 en todas las rutas', async () => {
      for (const [metodo, ruta] of [['GET', '/admin/reuniones'], ['GET', '/admin/reuniones/proyectos-elegibles'], ['POST', '/admin/reuniones'], ['PATCH', '/admin/reuniones/1'], ['DELETE', '/admin/reuniones/1']]) {
        expect((await pedir(metodo, ruta)).status, `${metodo} ${ruta}`).toBe(401);
      }
    });

    it('estudiante y líder de proyecto (sin rol administrador) → 403 en lectura y escritura', async () => {
      for (const quien of ['ESTUDIANTE', 'L1']) {
        expect((await pedir('GET', '/admin/reuniones', quien)).status).toBe(403);
        expect((await pedir('POST', '/admin/reuniones', quien, cuerpo([esc.p.P1.idProyecto]))).status).toBe(403);
      }
    });

    it('una cuenta INACTIVO no pasa la autenticación (401), aunque tenga token válido', async () => {
      expect((await pedir('GET', '/admin/reuniones', 'INACT')).status).toBe(401);
    });
  });

  describe('contrato de escritura', () => {
    it('POST 201 con la forma pública (sin correos ni campos internos de Prisma)', async () => {
      const res = await pedir('POST', '/admin/reuniones', 'ADMIN', cuerpo([esc.p.P1.idProyecto, esc.p.P2.idProyecto]));
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ version: 1, estado: 'ACTIVA', integridad: 'OK', canManage: true, contenido: { tituloEvento: 'Reunión HTTP', modalidad: 'VIRTUAL' } });
      expect(Object.keys(res.body).sort()).toEqual(['actualizadaEn', 'canManage', 'canceladaEn', 'contenido', 'creadaEn', 'creador', 'editores', 'estado', 'idReunion', 'integridad', 'motivoGestion', 'politicaEdicion', 'proyectos', 'puedeCambiarPolitica', 'version'].sort());
      expect(res.texto).not.toMatch(/correo|@example\.test|contrasena|recordatorioEnviadoEn|idCreador/);
    });

    it('400 por campos del servidor, proyectos repetidos o un proyecto no elegible (con su motivo)', async () => {
      expect((await pedir('POST', '/admin/reuniones', 'ADMIN', cuerpo([esc.p.P1.idProyecto], { idCreador: esc.id('ESTUDIANTE') }))).status).toBe(400);
      expect((await pedir('POST', '/admin/reuniones', 'ADMIN', cuerpo([esc.p.P1.idProyecto], { invitados: [esc.id('M1')] }))).status).toBe(400);
      expect((await pedir('POST', '/admin/reuniones', 'ADMIN', cuerpo([esc.p.P1.idProyecto, esc.p.P1.idProyecto]))).status).toBe(400);
      const vencido = await pedir('POST', '/admin/reuniones', 'ADMIN', cuerpo([esc.p.PVENC.idProyecto]));
      expect(vencido.status).toBe(400);
      expect(vencido.body).toMatchObject({ proyectos: [{ idProyecto: esc.p.PVENC.idProyecto, motivo: 'FUERA_DE_VENTANA_POSCIERRE' }] });
    });

    it('PATCH con versión desfasada → 409 con la versión actual; PATCH válido → 200', async () => {
      const creada = (await pedir('POST', '/admin/reuniones', 'ADMIN', cuerpo([esc.p.P2.idProyecto]))).body;
      expect((await pedir('PATCH', `/admin/reuniones/${creada.idReunion}`, 'ADMIN2', { version: 1, tituloEvento: 'Editada' })).status).toBe(200);
      const viejo = await pedir('PATCH', `/admin/reuniones/${creada.idReunion}`, 'ADMIN', { version: 1, tituloEvento: 'Tarde' });
      expect(viejo.status).toBe(409);
      expect(viejo.body).toMatchObject({ versionActual: 2 });
      expect((await pedir('PATCH', `/admin/reuniones/${creada.idReunion}`, 'ADMIN', { tituloEvento: 'Sin versión' })).status).toBe(400);
    });

    it('AC-12 por HTTP: SOLO_CREADOR impide a otro administrador editar o cancelar (403)', async () => {
      const creada = (await pedir('POST', '/admin/reuniones', 'ADMIN', cuerpo([esc.p.P2.idProyecto], { politicaEdicion: 'SOLO_CREADOR' }))).body;
      expect((await pedir('PATCH', `/admin/reuniones/${creada.idReunion}`, 'ADMIN2', { version: 1, tituloEvento: 'No' })).status).toBe(403);
      expect((await pedir('DELETE', `/admin/reuniones/${creada.idReunion}`, 'ADMIN2')).status).toBe(403);
      // La lectura administrativa es global, con canManage calculado para quien consulta.
      const vista = await pedir('GET', `/admin/reuniones/${creada.idReunion}`, 'ADMIN2');
      expect(vista).toMatchObject({ status: 200, body: { canManage: false, motivoGestion: null } });
    });

    it('DELETE cancela y es idempotente (200 las dos veces, misma fecha de cancelación)', async () => {
      const creada = (await pedir('POST', '/admin/reuniones', 'ADMIN', cuerpo([esc.p.P2.idProyecto]))).body;
      const primera = await pedir('DELETE', `/admin/reuniones/${creada.idReunion}`, 'ADMIN');
      const segunda = await pedir('DELETE', `/admin/reuniones/${creada.idReunion}`, 'ADMIN2');
      expect(primera).toMatchObject({ status: 200, body: { estado: 'CANCELADA' } });
      expect(segunda.status).toBe(200);
      expect(segunda.body.canceladaEn).toBe(primera.body.canceladaEn);
    });

    it('404 para una reunión inexistente y 400 para un id no numérico', async () => {
      expect((await pedir('GET', '/admin/reuniones/2000000000', 'ADMIN')).status).toBe(404);
      expect((await pedir('PATCH', '/admin/reuniones/2000000000', 'ADMIN', { version: 1 })).status).toBe(404);
      expect((await pedir('GET', '/admin/reuniones/abc', 'ADMIN')).status).toBe(400);
    });
  });

  describe('lecturas', () => {
    it('proyectos-elegibles no se confunde con :id y lista activos y cerrados en ventana, no los demás', async () => {
      const res = await pedir('GET', '/admin/reuniones/proyectos-elegibles', 'ADMIN');
      expect(res.status).toBe(200);
      const ids = (res.body as { idProyecto: number }[]).map((p) => p.idProyecto);
      for (const clave of ['P1', 'P2', 'PC'] as const) expect(ids, clave).toContain(esc.p[clave].idProyecto);
      for (const clave of ['PVENC', 'PSIN', 'PCANC'] as const) expect(ids, clave).not.toContain(esc.p[clave].idProyecto);
      const pc = (res.body as Record<string, unknown>[]).find((p) => p.idProyecto === esc.p.PC.idProyecto);
      expect(pc).toMatchObject({ estadoProyecto: 'CERRADO', integrantesConvocables: 2, lider: { idUsuario: esc.id('LC') } });
      expect(pc?.ventanaHasta).toEqual(expect.any(String));
      expect(res.texto).not.toMatch(/correo|@example\.test/);
    });

    it('participantes: por proyecto, con estado de cuenta y si se convoca; total de destinatarios únicos', async () => {
      const creada = (await pedir('POST', '/admin/reuniones', 'ADMIN', cuerpo([esc.p.P1.idProyecto, esc.p.P2.idProyecto]))).body;
      const res = await pedir('GET', `/admin/reuniones/${creada.idReunion}/participantes`, 'ADMIN');
      expect(res.status).toBe(200);
      expect(res.body.totalDestinatariosUnicos).toBe(5);
      const p1 = res.body.proyectos.find((p: { idProyecto: number }) => p.idProyecto === esc.p.P1.idProyecto);
      expect(p1.lider).toMatchObject({ idUsuario: esc.id('L1'), convocado: true });
      const porId = new Map(p1.integrantes.map((i: { idUsuario: number }) => [i.idUsuario, i]));
      expect(porId.get(esc.id('INACT'))).toMatchObject({ estadoCuenta: 'INACTIVO', convocado: false });
      expect(porId.get(esc.id('M1'))).toMatchObject({ estadoCuenta: 'ACTIVO', convocado: true });
      expect(porId.has(esc.id('RET'))).toBe(false);
      expect(res.texto).not.toMatch(/correo|@example\.test/);
      // Solo Administración.
      expect((await pedir('GET', `/admin/reuniones/${creada.idReunion}/participantes`, 'L1')).status).toBe(403);
    });

    it('listado paginado: activas por fecha y canceladas en su propio filtro', async () => {
      const a = (await pedir('POST', '/admin/reuniones', 'ADMIN', cuerpo([esc.p.P2.idProyecto], { tituloEvento: 'Lista tarde', fechaInicio: esc.enDias(30).toISOString(), fechaFin: esc.enDias(30, 16).toISOString() }))).body;
      const b = (await pedir('POST', '/admin/reuniones', 'ADMIN', cuerpo([esc.p.P2.idProyecto], { tituloEvento: 'Lista pronto', fechaInicio: esc.enDias(2).toISOString(), fechaFin: esc.enDias(2, 16).toISOString() }))).body;
      const activas = await pedir('GET', '/admin/reuniones?estado=activas&limit=50', 'ADMIN');
      expect(activas.status).toBe(200);
      const orden = (activas.body.data as { idReunion: number }[]).map((r) => r.idReunion);
      expect(orden.indexOf(b.idReunion)).toBeLessThan(orden.indexOf(a.idReunion));
      expect(activas.body).toMatchObject({ page: 1, total: expect.any(Number), totalPages: expect.any(Number) });

      await pedir('DELETE', `/admin/reuniones/${a.idReunion}`, 'ADMIN');
      const canceladas = await pedir('GET', '/admin/reuniones?estado=canceladas&limit=50', 'ADMIN');
      const cancelada = (canceladas.body.data as { idReunion: number; contenido: { tituloEvento: string } }[]).find((r) => r.idReunion === a.idReunion);
      expect(cancelada?.contenido.tituloEvento).toBe('Lista tarde');
      expect(((await pedir('GET', '/admin/reuniones?limit=50', 'ADMIN')).body.data as { idReunion: number }[]).map((r) => r.idReunion)).not.toContain(a.idReunion);

      const rango = await pedir('GET', `/admin/reuniones?desde=${esc.enDias(29).toISOString()}&hasta=${esc.enDias(31).toISOString()}&estado=canceladas`, 'ADMIN');
      expect((rango.body.data as { idReunion: number }[]).map((r) => r.idReunion)).toContain(a.idReunion);
      expect((await pedir('GET', '/admin/reuniones?estado=todas', 'ADMIN')).status).toBe(400);
      expect((await pedir('GET', '/admin/reuniones?limit=51', 'ADMIN')).status).toBe(400);
    });
  });

  describe('AC-14: el líder no toca la proyección por la ruta ordinaria de eventos', () => {
    it('PATCH y DELETE de /proyectos/:id/eventos/:idEvento → 403 y la reunión queda intacta', async () => {
      const creada = (await pedir('POST', '/admin/reuniones', 'ADMIN', cuerpo([esc.p.P1.idProyecto]))).body;
      const idEvento = creada.proyectos[0].idEvento;
      expect((await pedir('PATCH', `/proyectos/${esc.p.P1.idProyecto}/eventos/${idEvento}`, 'L1', { tituloEvento: 'Del líder' })).status).toBe(403);
      expect((await pedir('DELETE', `/proyectos/${esc.p.P1.idProyecto}/eventos/${idEvento}`, 'L1')).status).toBe(403);
      expect(await prisma.eventoProyecto.findUniqueOrThrow({ where: { idEvento } })).toMatchObject({ tituloEvento: 'Reunión HTTP', eliminadoEn: null });
    });
  });
});
