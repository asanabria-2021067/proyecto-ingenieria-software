import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { PARAMTYPES_METADATA } from '@nestjs/common/constants';
import { NestFactory } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import type { AddressInfo } from 'node:net';
import type { PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import { createIntegrationUser, createIntegrationProject, createIntegrationProjectRole, createIntegrationParticipation } from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { EventsController } from '../../src/events/events.controller';
import { EventsService } from '../../src/events/events.service';
import { EventsReminderService } from '../../src/events/events-reminder.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import type { NotificationsGateway } from '../../src/notifications/notifications.gateway';
import { JwtStrategy } from '../../src/auth/jwt.strategy';
import { PrismaService } from '../../src/prisma/prisma.service';
import { getJwtSecret } from '../../src/config/jwt-secret';
import { CreateEventDto } from '../../src/events/dto/create-event.dto';
import { UpdateEventDto } from '../../src/events/dto/update-event.dto';

const cookieParser = require('cookie-parser') as () => unknown;

/**
 * G04 (C14–C17): contrato HTTP real de los eventos de proyecto contra
 * PostgreSQL (base desechable, `INTEGRATION_DATABASE_URL`). Mismo arnés que
 * `calendar-shares-http.integration.spec.ts`: `NestFactory` con el controller,
 * el servicio y el `JwtStrategy` REALES y el mismo `ValidationPipe` de main.ts
 * (whitelist, forbidNonWhitelisted, transform con conversión implícita).
 */
function definirParamtypes() {
  const clases: [unknown, unknown[]][] = [
    [EventsController, [EventsService]],
    [EventsService, [PrismaService]],
    [JwtStrategy, [PrismaService]],
  ];
  for (const [clase, deps] of clases) {
    if (!Reflect.getMetadata(PARAMTYPES_METADATA, clase as object)) Reflect.defineMetadata(PARAMTYPES_METADATA, deps, clase as object);
  }
  // Lo que `emitDecoratorMetadata` genera en el build real: sin esto el ValidationPipe no sabe contra qué DTO validar.
  const handlers: [object, string, unknown[]][] = [
    [EventsController.prototype, 'findAll', [Number, Object]],
    [EventsController.prototype, 'create', [Number, Object, CreateEventDto]],
    [EventsController.prototype, 'update', [Number, Number, Object, UpdateEventDto]],
    [EventsController.prototype, 'remove', [Number, Number, Object]],
  ];
  for (const [proto, nombre, tipos] of handlers) {
    if (!Reflect.getMetadata(PARAMTYPES_METADATA, proto, nombre)) Reflect.defineMetadata(PARAMTYPES_METADATA, tipos, proto, nombre);
  }
}

describeIntegration('G04 — contrato HTTP de eventos de proyecto (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let url: string;
  const scope: IntegrationCleanupScope = { userIds: [], projectIds: [], roleIds: [], participationIds: [], sprintIds: [], taskIds: [], assignmentIds: [] };
  const ids = { lider: 0, integrante: 0, tardio: 0, tercero: 0, proyecto: 0 };
  const tokens = { lider: '', integrante: '' };

  const pedir = (ruta: string, token: string, init: RequestInit = {}) =>
    fetch(`${url}${ruta}`, { ...init, headers: { ...(init.headers ?? {}), cookie: `access_token=${token}`, 'content-type': 'application/json' } });
  const crear = async (cuerpo: Record<string, unknown>) => {
    const res = await pedir(`/proyectos/${ids.proyecto}/eventos`, tokens.lider, {
      method: 'POST',
      body: JSON.stringify({ tituloEvento: 'Evento G04', fechaInicio: '2031-03-10T15:00:00.000Z', fechaFin: '2031-03-10T16:00:00.000Z', ...cuerpo }),
    });
    return { res, json: (await res.json()) as Record<string, unknown> };
  };
  const editar = async (idEvento: number, cuerpo: Record<string, unknown>) => {
    const res = await pedir(`/proyectos/${ids.proyecto}/eventos/${idEvento}`, tokens.lider, { method: 'PATCH', body: JSON.stringify(cuerpo) });
    return { res, json: (await res.json()) as Record<string, unknown> };
  };
  const fila = (idEvento: number) =>
    prisma.eventoProyecto.findUniqueOrThrow({
      where: { idEvento },
      select: { modalidad: true, ubicacionLat: true, ubicacionLng: true, ubicacionNombre: true, linkSesion: true, invitados: true, recordatorioEnviadoEn: true },
    });

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
    definirParamtypes();

    @Module({
      imports: [PassportModule],
      controllers: [EventsController],
      providers: [{ provide: PrismaService, useValue: prisma }, EventsService, JwtStrategy],
    })
    class HarnessModule {}

    app = await NestFactory.create(HarnessModule, { logger: false });
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`;

    const lider = await createIntegrationUser(prisma, { nombre: 'Líder', apellido: 'G04' });
    const integrante = await createIntegrationUser(prisma, { nombre: 'Integrante', apellido: 'G04' });
    scope.userIds!.push(lider.idUsuario, integrante.idUsuario);
    ids.lider = lider.idUsuario;
    ids.integrante = integrante.idUsuario;
    const proyecto = await createIntegrationProject(prisma, lider.idUsuario, { tituloProyecto: 'Proyecto G04', estadoProyecto: 'EN_PROGRESO' });
    scope.projectIds!.push(proyecto.idProyecto);
    ids.proyecto = proyecto.idProyecto;
    const rol = await createIntegrationProjectRole(prisma, proyecto.idProyecto);
    scope.roleIds!.push(rol.idRolProyecto);
    const participacion = await createIntegrationParticipation(prisma, integrante.idUsuario, rol.idRolProyecto);
    scope.participationIds!.push(participacion.idParticipacion);
    // G04-C16: dos integrantes activos más (uno se invita tarde; el otro nunca se invita).
    for (const clave of ['tardio', 'tercero'] as const) {
      const persona = await createIntegrationUser(prisma, { nombre: clave, apellido: 'G04' });
      scope.userIds!.push(persona.idUsuario);
      ids[clave] = persona.idUsuario;
      const p = await createIntegrationParticipation(prisma, persona.idUsuario, rol.idRolProyecto);
      scope.participationIds!.push(p.idParticipacion);
    }

    const jwt = new JwtService({ secret: getJwtSecret() });
    const firmar = (u: { idUsuario: number; correo: string }) => jwt.sign({ sub: u.idUsuario, correo: u.correo, tipo: 'access' });
    tokens.lider = firmar(lider);
    tokens.integrante = firmar(integrante);
  }, 60_000);

  afterAll(async () => {
    try {
      await prisma.notificacion.deleteMany({ where: { idUsuario: { in: scope.userIds } } });
      await prisma.eventoProyecto.deleteMany({ where: { idProyecto: { in: scope.projectIds } } });
      await cleanupIntegrationFixtures(prisma, scope);
    } finally {
      await app?.close();
      await prisma.$disconnect();
    }
  });

  describe('G04-C14 (UI-35): metadatos de modalidad al editar', () => {
    const PRESENCIAL = { modalidad: 'PRESENCIAL', ubicacionLat: 14.6048, ubicacionLng: -90.4899, ubicacionNombre: 'Edificio CIT, salón 210' };

    it('PRESENCIAL → VIRTUAL con null explícito deja la fila sin coordenadas ni nombre de lugar, y la lectura posterior no muestra un lugar huérfano', async () => {
      const { res: creado, json } = await crear(PRESENCIAL);
      expect(creado.status).toBe(201);
      const idEvento = json.idEvento as number;
      expect(await fila(idEvento)).toMatchObject({ modalidad: 'PRESENCIAL', ubicacionLat: 14.6048, ubicacionLng: -90.4899, ubicacionNombre: 'Edificio CIT, salón 210' });

      const { res, json: editado } = await editar(idEvento, { modalidad: 'VIRTUAL', linkSesion: 'https://meet.google.com/abc-defg-hij', ubicacionLat: null, ubicacionLng: null, ubicacionNombre: null });
      expect(res.status).toBe(200);
      expect(editado).toMatchObject({ modalidad: 'VIRTUAL', ubicacionLat: null, ubicacionLng: null, ubicacionNombre: null, linkSesion: 'https://meet.google.com/abc-defg-hij' });
      expect(await fila(idEvento)).toMatchObject({ modalidad: 'VIRTUAL', ubicacionLat: null, ubicacionLng: null, ubicacionNombre: null, linkSesion: 'https://meet.google.com/abc-defg-hij' });

      const lista = (await (await pedir(`/proyectos/${ids.proyecto}/eventos`, tokens.integrante)).json()) as Record<string, unknown>[];
      expect(lista.find((e) => e.idEvento === idEvento)).toMatchObject({ modalidad: 'VIRTUAL', ubicacionLat: null, ubicacionLng: null, ubicacionNombre: null });
    });

    it('un PATCH parcial sin campos de ubicación (cliente antiguo) no borra nada por omisión', async () => {
      const { json } = await crear(PRESENCIAL);
      const idEvento = json.idEvento as number;
      const { res } = await editar(idEvento, { modalidad: 'VIRTUAL', linkSesion: 'https://meet.google.com/abc-defg-hij' });
      expect(res.status).toBe(200);
      expect(await fila(idEvento)).toMatchObject({ modalidad: 'VIRTUAL', ubicacionLat: 14.6048, ubicacionLng: -90.4899, ubicacionNombre: 'Edificio CIT, salón 210' });
    });

    it('MIXTA conserva lugar y enlace; VIRTUAL → PRESENCIAL con linkSesion null limpia el enlace', async () => {
      const { json } = await crear({ ...PRESENCIAL, modalidad: 'MIXTA', linkSesion: 'https://meet.google.com/abc-defg-hij' });
      const idEvento = json.idEvento as number;
      expect(await fila(idEvento)).toMatchObject({ modalidad: 'MIXTA', ubicacionLat: 14.6048, linkSesion: 'https://meet.google.com/abc-defg-hij' });

      const { res } = await editar(idEvento, { modalidad: 'PRESENCIAL', ubicacionLat: 14.6048, ubicacionLng: -90.4899, linkSesion: null });
      expect(res.status).toBe(200);
      expect(await fila(idEvento)).toMatchObject({ modalidad: 'PRESENCIAL', ubicacionLat: 14.6048, ubicacionLng: -90.4899, linkSesion: null });
    });

    it('no se puede dejar sin ubicación un presencial ni sin enlace un virtual: 400 y la fila queda intacta', async () => {
      const { json } = await crear(PRESENCIAL);
      const idEvento = json.idEvento as number;
      // Sin modalidad en el cuerpo el DTO no puede saberlo: lo rechaza el servicio con la modalidad guardada.
      const sinUbicacion = await editar(idEvento, { ubicacionLat: null, ubicacionLng: null });
      expect(sinUbicacion.res.status).toBe(400);
      expect(String(sinUbicacion.json.message)).toContain('necesita su ubicación');
      // Con la modalidad en el cuerpo lo rechaza el propio DTO.
      expect((await editar(idEvento, { modalidad: 'PRESENCIAL', ubicacionLat: null, ubicacionLng: null })).res.status).toBe(400);
      expect(await fila(idEvento)).toMatchObject({ modalidad: 'PRESENCIAL', ubicacionLat: 14.6048, ubicacionLng: -90.4899 });

      const virtual = await crear({ modalidad: 'VIRTUAL', linkSesion: 'https://meet.google.com/abc-defg-hij' });
      const sinEnlace = await editar(virtual.json.idEvento as number, { linkSesion: null });
      expect(sinEnlace.res.status).toBe(400);
      expect(await fila(virtual.json.idEvento as number)).toMatchObject({ linkSesion: 'https://meet.google.com/abc-defg-hij' });
    });

    it('un integrante que no lidera no puede editar (403): la limpieza no abre ningún atajo de permisos', async () => {
      const { json } = await crear(PRESENCIAL);
      const res = await pedir(`/proyectos/${ids.proyecto}/eventos/${json.idEvento}`, tokens.integrante, { method: 'PATCH', body: JSON.stringify({ modalidad: 'VIRTUAL', linkSesion: 'https://meet.google.com/abc-defg-hij', ubicacionLat: null, ubicacionLng: null, ubicacionNombre: null }) });
      expect(res.status).toBe(403);
      expect(await fila(json.idEvento as number)).toMatchObject({ modalidad: 'PRESENCIAL', ubicacionLat: 14.6048 });
    });
  });

  describe('G04-C17 (UI-24): el enlace de la sesión se valida igual que en el formulario', () => {
    it.each([
      'http://localhost:3000/sala',
      'https://intranet/sala',
      'https://exa_mple.com/x',
      'https://ejemplo.com/<script>',
      'https://ejemplo.com/\u200bx',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
    ])('rechaza con 400 y no crea nada: %j', async (linkSesion) => {
      const antes = await prisma.eventoProyecto.count({ where: { idProyecto: ids.proyecto } });
      const { res, json } = await crear({ modalidad: 'VIRTUAL', linkSesion });
      expect(res.status).toBe(400);
      expect(JSON.stringify(json.message)).toContain('linkSesion debe ser una URL http/https válida');
      expect(await prisma.eventoProyecto.count({ where: { idProyecto: ids.proyecto } })).toBe(antes);
    });

    it('acepta un enlace real (con puerto, ruta y consulta) y lo guarda tal como llegó', async () => {
      const linkSesion = 'https://teams.microsoft.com:443/l/meetup-join/19%3ameeting?context=%7b%7d';
      const { res, json } = await crear({ modalidad: 'VIRTUAL', linkSesion });
      expect(res.status).toBe(201);
      expect((await fila(json.idEvento as number)).linkSesion).toBe(linkSesion);
    });

    it('la misma política aplica al editar', async () => {
      const { json } = await crear({ modalidad: 'VIRTUAL', linkSesion: 'https://meet.google.com/abc-defg-hij' });
      const idEvento = json.idEvento as number;
      expect((await editar(idEvento, { modalidad: 'VIRTUAL', linkSesion: 'https://intranet/sala' })).res.status).toBe(400);
      expect((await fila(idEvento)).linkSesion).toBe('https://meet.google.com/abc-defg-hij');
      expect((await editar(idEvento, { modalidad: 'VIRTUAL', linkSesion: 'https://zoom.us/j/123' })).res.status).toBe(200);
      expect((await fila(idEvento)).linkSesion).toBe('https://zoom.us/j/123');
    });
  });

  /**
   * G04-C16 (UI-22): recordatorios reales. EventsReminderService y
   * NotificationsService son los de producción (sin gateway de sockets: las
   * notificaciones se persisten igual); la consulta de "a quién ya avisé" usa
   * los filtros JSON de PostgreSQL de verdad.
   */
  describe('G04-C16 (UI-22): recordatorio al añadir invitados, sin duplicados', () => {
    let reminder: EventsReminderService;
    let idEvento = 0;
    const LINK = 'https://meet.google.com/abc-defg-hij';
    // Empieza en 30 minutos con 60 de antelación: el recordatorio ya debe salir.
    const enMinutos = (m: number) => new Date(Math.ceil(Date.now() / 60_000) * 60_000 + m * 60_000).toISOString();
    let inicio = '';
    /** Recordatorios de este evento por persona. */
    const avisos = async () => {
      const filas = await prisma.notificacion.findMany({
        where: { tipoNotificacion: 'RECORDATORIO_EVENTO', datosJson: { path: ['eventId'], equals: idEvento } },
        select: { idUsuario: true },
      });
      const porUsuario = new Map<number, number>();
      for (const f of filas) porUsuario.set(f.idUsuario, (porUsuario.get(f.idUsuario) ?? 0) + 1);
      return { total: filas.length, de: (idUsuario: number) => porUsuario.get(idUsuario) ?? 0 };
    };
    /** Lo que el diálogo real envía en cada edición. */
    const guardar = (invitados: number[], extra: Record<string, unknown> = {}) => editar(idEvento, { tituloEvento: 'Kickoff G04', fechaInicio: inicio, invitados, ...extra });

    beforeAll(() => {
      const notifications = new NotificationsService(prisma as unknown as PrismaService, {} as NotificationsGateway);
      reminder = new EventsReminderService(prisma as unknown as PrismaService, notifications);
    });

    it('primer envío: reciben el aviso el líder y la persona invitada, una vez cada uno, y el evento queda marcado', async () => {
      inicio = enMinutos(30);
      const { res, json } = await crear({ tituloEvento: 'Kickoff G04', fechaInicio: inicio, fechaFin: enMinutos(90), antelacionMinutos: 60, modalidad: 'VIRTUAL', linkSesion: LINK, invitados: [ids.integrante] });
      expect(res.status).toBe(201);
      idEvento = json.idEvento as number;

      await reminder.enviarRecordatoriosPendientes();

      const a = await avisos();
      expect([a.total, a.de(ids.lider), a.de(ids.integrante), a.de(ids.tardio), a.de(ids.tercero)]).toEqual([2, 1, 1, 0, 0]);
      expect((await fila(idEvento)).recordatorioEnviadoEn).not.toBeNull();
    });

    it('volver a correr el cron no reenvía nada', async () => {
      await reminder.enviarRecordatoriosPendientes();
      await reminder.enviarRecordatoriosPendientes();
      expect((await avisos()).total).toBe(2);
    });

    it('añadir un invitado después del envío: solo esa persona recibe el aviso; los ya notificados no se duplican', async () => {
      expect((await guardar([ids.integrante, ids.tardio])).res.status).toBe(200);
      expect((await fila(idEvento)).recordatorioEnviadoEn).toBeNull();

      await reminder.enviarRecordatoriosPendientes();

      const a = await avisos();
      expect([a.total, a.de(ids.lider), a.de(ids.integrante), a.de(ids.tardio), a.de(ids.tercero)]).toEqual([3, 1, 1, 1, 0]);
      expect((await fila(idEvento)).recordatorioEnviadoEn).not.toBeNull();
    });

    it('editar solo el título (con los mismos invitados) o quitar a un invitado no reabre el recordatorio ni envía nada', async () => {
      expect((await guardar([ids.integrante, ids.tardio], { tituloEvento: 'Kickoff G04 (aula nueva)' })).res.status).toBe(200);
      expect((await fila(idEvento)).recordatorioEnviadoEn).not.toBeNull();
      expect((await guardar([ids.integrante])).res.status).toBe(200);
      expect((await fila(idEvento)).recordatorioEnviadoEn).not.toBeNull();

      await reminder.enviarRecordatoriosPendientes();
      expect((await avisos()).total).toBe(3);
    });

    it('abrir el evento a todo el proyecto: recibe aviso únicamente quien nunca lo tuvo', async () => {
      expect((await guardar([])).res.status).toBe(200);
      expect((await fila(idEvento)).recordatorioEnviadoEn).toBeNull();

      await reminder.enviarRecordatoriosPendientes();

      const a = await avisos();
      expect([a.total, a.de(ids.lider), a.de(ids.integrante), a.de(ids.tardio), a.de(ids.tercero)]).toEqual([4, 1, 1, 1, 1]);
    });

    it('mover la hora de inicio sí avisa a todos de la fecha nueva (T-265 intacto), una sola vez', async () => {
      inicio = enMinutos(40);
      expect((await guardar([], { fechaFin: enMinutos(100) })).res.status).toBe(200);
      expect((await fila(idEvento)).recordatorioEnviadoEn).toBeNull();

      await reminder.enviarRecordatoriosPendientes();
      await reminder.enviarRecordatoriosPendientes();

      const a = await avisos();
      expect([a.total, a.de(ids.lider), a.de(ids.integrante), a.de(ids.tardio), a.de(ids.tercero)]).toEqual([8, 2, 2, 2, 2]);
      const nuevos = await prisma.notificacion.count({
        where: { tipoNotificacion: 'RECORDATORIO_EVENTO', AND: [{ datosJson: { path: ['eventId'], equals: idEvento } }, { datosJson: { path: ['fechaInicioIso'], equals: inicio } }] },
      });
      expect(nuevos).toBe(4);
    });

    it('un aviso anterior a G04 (sin fechaInicioIso) también se reconoce por su texto y no se duplica', async () => {
      // Se simula el dato histórico: se quita la clave nueva de los avisos de la hora vigente.
      const vigentes = await prisma.notificacion.findMany({
        where: { tipoNotificacion: 'RECORDATORIO_EVENTO', AND: [{ datosJson: { path: ['eventId'], equals: idEvento } }, { datosJson: { path: ['fechaInicioIso'], equals: inicio } }] },
        select: { idNotificacion: true, datosJson: true },
      });
      for (const n of vigentes) {
        const { fechaInicioIso: _omitida, ...legado } = n.datosJson as Record<string, unknown>;
        await prisma.notificacion.update({ where: { idNotificacion: n.idNotificacion }, data: { datosJson: legado as object } });
      }
      // Se reabre a mano la marca, como si se hubiera añadido alguien.
      await prisma.eventoProyecto.update({ where: { idEvento }, data: { recordatorioEnviadoEn: null } });

      await reminder.enviarRecordatoriosPendientes();

      expect((await avisos()).total).toBe(8);
      expect((await fila(idEvento)).recordatorioEnviadoEn).not.toBeNull();
    });
  });
});
