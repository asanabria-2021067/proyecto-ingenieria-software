import 'reflect-metadata';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { PARAMTYPES_METADATA } from '@nestjs/common/constants';
import { NestFactory } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import type { AddressInfo } from 'node:net';
import type { PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import {
  createIntegrationUser,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationParticipation,
  createIntegrationSprint,
  createIntegrationTask,
  createIntegrationTaskAssignment,
} from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { CalendarSharesController } from '../../src/calendar-shares/calendar-shares.controller';
import { CalendarSharesService } from '../../src/calendar-shares/calendar-shares.service';
import { EventsService } from '../../src/events/events.service';
import { MyEventsController } from '../../src/events/my-events.controller';
import { JwtStrategy } from '../../src/auth/jwt.strategy';
import { PrismaService } from '../../src/prisma/prisma.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { getJwtSecret } from '../../src/config/jwt-secret';
import { GetEventsRangeQueryDto } from '../../src/events/dto/get-events-range-query.dto';
import { ShareCalendarDto } from '../../src/calendar-shares/dto/share-calendar.dto';

const cookieParser = require('cookie-parser') as () => unknown;

/**
 * G01-C14 (UI-01, UI-15, UI-31): el contrato HTTP real de los calendarios
 * compartidos contra PostgreSQL (base desechable, `INTEGRATION_DATABASE_URL`).
 * Igual que test/helpers/auth-http-harness.ts: el proyecto no instala
 * `@nestjs/testing` ni supertest, así que se levanta con `NestFactory` un
 * módulo mínimo con el controller REAL, el servicio REAL, el `JwtStrategy`
 * REAL (cookie `access_token` firmada con el JWT_SECRET sintético) y el
 * `ValidationPipe` global de main.ts. Se verifica el JSON de red, no la UI.
 */
const DESDE = '2026-11-01T00:00:00.000Z';
const HASTA = '2026-11-30T23:59:59.000Z';
const RANGO = `desde=${encodeURIComponent(DESDE)}&hasta=${encodeURIComponent(HASTA)}`;
const PRIVADOS = ['SECRETO', 'linkSesion', 'descripcionEvento', 'ubicacionLat', 'ubicacionLng', 'ubicacionNombre', 'invitados', 'rolesDestino', 'antelacionMinutos', 'idCreador', 'correo'];

function definirParamtypes() {
  const tabla: [unknown, unknown[]][] = [
    [CalendarSharesController, [CalendarSharesService]],
    [MyEventsController, [EventsService]],
    [CalendarSharesService, [PrismaService, EventsService, NotificationsService]],
    [EventsService, [PrismaService]],
    [JwtStrategy, [PrismaService]],
  ];
  for (const [clase, deps] of tabla) {
    if (!Reflect.getMetadata(PARAMTYPES_METADATA, clase as object)) {
      Reflect.defineMetadata(PARAMTYPES_METADATA, deps, clase as object);
    }
  }
  // Tipos de los parámetros de cada handler (lo que `emitDecoratorMetadata` genera en el build real):
  // sin ellos el ValidationPipe no sabe contra qué DTO validar @Query/@Body.
  const handlers: [object, string, unknown[]][] = [
    [CalendarSharesController.prototype, 'agenda', [Object, Number, GetEventsRangeQueryDto]],
    [CalendarSharesController.prototype, 'compartir', [Object, ShareCalendarDto]],
    [CalendarSharesController.prototype, 'dejarDeCompartir', [Object, Number]],
    [CalendarSharesController.prototype, 'dejarDeRecibir', [Object, Number]],
    [CalendarSharesController.prototype, 'listar', [Object]],
    [MyEventsController.prototype, 'findInRange', [Object, GetEventsRangeQueryDto]],
  ];
  for (const [proto, nombre, tipos] of handlers) {
    if (!Reflect.getMetadata(PARAMTYPES_METADATA, proto, nombre)) {
      Reflect.defineMetadata(PARAMTYPES_METADATA, tipos, proto, nombre);
    }
  }
}

describeIntegration('G01-C14 — contrato HTTP de calendarios compartidos (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let url: string;
  const notifyFromTemplate = vi.fn().mockResolvedValue(undefined);
  const scope: IntegrationCleanupScope = { userIds: [], projectIds: [], roleIds: [], participationIds: [], sprintIds: [], taskIds: [], assignmentIds: [] };
  const ids = { owner: 0, viewer: 0, externo: 0, comun: 0, ajeno: 0, eventos: {} as Record<string, number>, tareaComun: 0, tareaAjena: 0 };
  const tokens = { owner: '', viewer: '', externo: '' };

  const pedir = (ruta: string, token: string | null, init: RequestInit = {}) =>
    fetch(`${url}${ruta}`, { ...init, headers: { ...(init.headers ?? {}), ...(token ? { cookie: `access_token=${token}` } : {}), 'content-type': 'application/json' } });

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
    definirParamtypes();

    @Module({
      imports: [PassportModule],
      controllers: [CalendarSharesController, MyEventsController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        EventsService,
        CalendarSharesService,
        JwtStrategy,
        { provide: NotificationsService, useValue: { notifyFromTemplate } },
      ],
    })
    class HarnessModule {}

    app = await NestFactory.create(HarnessModule, { logger: false });
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`;

    // --- Fixtures: propietario líder de COMUN (viewer ACTIVO) y de AJENO (viewer no pertenece); externo sin nada.
    const owner = await createIntegrationUser(prisma, { nombre: 'Owner', apellido: 'G01' });
    const viewer = await createIntegrationUser(prisma, { nombre: 'Viewer', apellido: 'G01' });
    const externo = await createIntegrationUser(prisma, { nombre: 'Externo', apellido: 'G01' });
    scope.userIds!.push(owner.idUsuario, viewer.idUsuario, externo.idUsuario);
    ids.owner = owner.idUsuario;
    ids.viewer = viewer.idUsuario;
    ids.externo = externo.idUsuario;

    const comun = await createIntegrationProject(prisma, owner.idUsuario, { tituloProyecto: 'Proyecto común G01' });
    const ajeno = await createIntegrationProject(prisma, owner.idUsuario, { tituloProyecto: 'SECRETO proyecto ajeno G01' });
    scope.projectIds!.push(comun.idProyecto, ajeno.idProyecto);
    ids.comun = comun.idProyecto;
    ids.ajeno = ajeno.idProyecto;
    const rol = await createIntegrationProjectRole(prisma, comun.idProyecto);
    scope.roleIds!.push(rol.idRolProyecto);
    const participacion = await createIntegrationParticipation(prisma, viewer.idUsuario, rol.idRolProyecto);
    scope.participationIds!.push(participacion.idParticipacion);

    const sprintComun = await createIntegrationSprint(prisma, comun.idProyecto);
    const sprintAjeno = await createIntegrationSprint(prisma, ajeno.idProyecto);
    scope.sprintIds!.push(sprintComun.idSprint, sprintAjeno.idSprint);
    const tareaComun = await createIntegrationTask(prisma, comun.idProyecto, owner.idUsuario, sprintComun.idSprint, { tituloTarea: 'Informe común' });
    const tareaAjena = await createIntegrationTask(prisma, ajeno.idProyecto, owner.idUsuario, sprintAjeno.idSprint, { tituloTarea: 'SECRETO tarea ajena' });
    scope.taskIds!.push(tareaComun.idTarea, tareaAjena.idTarea);
    ids.tareaComun = tareaComun.idTarea;
    ids.tareaAjena = tareaAjena.idTarea;
    for (const idTarea of [tareaComun.idTarea, tareaAjena.idTarea]) {
      await prisma.tarea.update({ where: { idTarea }, data: { fechaLimite: new Date('2026-11-10') } });
      const asignacion = await createIntegrationTaskAssignment(prisma, idTarea, owner.idUsuario, owner.idUsuario);
      scope.assignmentIds!.push(asignacion.idAsignacion);
    }

    const evento = async (nombre: string, idProyecto: number, titulo: string, invitados: number[]) => {
      const fila = await prisma.eventoProyecto.create({
        data: {
          idProyecto,
          idCreador: owner.idUsuario,
          tituloEvento: titulo,
          descripcionEvento: `SECRETO descripción ${nombre}`,
          fechaInicio: new Date('2026-11-05T15:00:00.000Z'),
          fechaFin: new Date('2026-11-05T16:00:00.000Z'),
          linkSesion: `https://meet.example/SECRETO-${nombre}`,
          ubicacionNombre: `SECRETO lugar ${nombre}`,
          tipoEvento: 'REUNION',
          invitados,
        },
        select: { idEvento: true },
      });
      ids.eventos[nombre] = fila.idEvento;
    };
    await evento('comunPublico', comun.idProyecto, 'Reunión común pública', []);
    await evento('comunConViewer', comun.idProyecto, 'Reunión común con viewer', [owner.idUsuario, viewer.idUsuario]);
    await evento('comunSinViewer', comun.idProyecto, 'SECRETO reunión restringida sin viewer', [owner.idUsuario]);
    await evento('ajenoPublico', ajeno.idProyecto, 'SECRETO reunión ajena pública', []);
    await evento('ajenoRestringido', ajeno.idProyecto, 'SECRETO reunión ajena restringida', [owner.idUsuario]);

    await prisma.calendarioCompartido.create({ data: { idPropietario: owner.idUsuario, idInvitado: viewer.idUsuario } });

    const jwt = new JwtService({ secret: getJwtSecret() });
    const firmar = (u: { idUsuario: number; correo: string }) => jwt.sign({ sub: u.idUsuario, correo: u.correo, tipo: 'access' });
    tokens.owner = firmar(owner);
    tokens.viewer = firmar(viewer);
    tokens.externo = firmar(externo);
  }, 60_000);

  afterAll(async () => {
    try {
      await prisma.calendarioCompartido.deleteMany({ where: { OR: [{ idPropietario: { in: scope.userIds } }, { idInvitado: { in: scope.userIds } }] } });
      await prisma.notificacion.deleteMany({ where: { idUsuario: { in: scope.userIds } } });
      await prisma.eventoProyecto.deleteMany({ where: { idProyecto: { in: scope.projectIds } } });
      await cleanupIntegrationFixtures(prisma, scope);
    } finally {
      await app?.close();
      await prisma.$disconnect();
    }
  });

  it('sin cookie de sesión el guard real responde 401', async () => {
    const res = await pedir(`/usuarios/me/calendario/compartidos-conmigo/${ids.owner}/agenda?${RANGO}`, null);
    expect(res.status).toBe(401);
  });

  it('un tercero al que no le compartieron recibe 403 y ningún dato', async () => {
    const res = await pedir(`/usuarios/me/calendario/compartidos-conmigo/${ids.owner}/agenda?${RANGO}`, tokens.externo);
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain('SECRETO');
  });

  it('el receptor ve detalle solo en el proyecto común, "ocupado" en el ajeno, y nunca lo restringido a otros ni campos privados', async () => {
    const res = await pedir(`/usuarios/me/calendario/compartidos-conmigo/${ids.owner}/agenda?${RANGO}`, tokens.viewer);
    expect(res.status).toBe(200);
    const texto = await res.text();
    const json = JSON.parse(texto) as { eventos: Record<string, unknown>[]; tareas: Record<string, unknown>[] };

    const porId = Object.fromEntries(json.eventos.map((e) => [e.idEvento as number, e]));
    expect(Object.keys(porId).map(Number).sort()).toEqual([ids.eventos.comunPublico, ids.eventos.comunConViewer, ids.eventos.ajenoPublico].sort());
    expect(porId[ids.eventos.comunSinViewer]).toBeUndefined();
    expect(porId[ids.eventos.ajenoRestringido]).toBeUndefined();

    expect(Object.keys(porId[ids.eventos.comunPublico]).sort()).toEqual(['fechaFin', 'fechaInicio', 'idEvento', 'modalidad', 'proyecto', 'tipoEvento', 'tituloEvento', 'visibilidad']);
    expect(porId[ids.eventos.comunPublico]).toMatchObject({ visibilidad: 'DETALLE', tituloEvento: 'Reunión común pública', proyecto: { idProyecto: ids.comun, tituloProyecto: 'Proyecto común G01' } });
    expect(porId[ids.eventos.comunConViewer]).toMatchObject({ visibilidad: 'DETALLE', tituloEvento: 'Reunión común con viewer' });
    expect(Object.keys(porId[ids.eventos.ajenoPublico]).sort()).toEqual(['fechaFin', 'fechaInicio', 'idEvento', 'visibilidad']);
    expect(porId[ids.eventos.ajenoPublico]).toMatchObject({ visibilidad: 'OCUPADO' });

    const tareas = Object.fromEntries(json.tareas.map((t) => [t.idTarea as number, t]));
    expect(tareas[ids.tareaComun]).toMatchObject({ visibilidad: 'DETALLE', tituloTarea: 'Informe común' });
    expect(Object.keys(tareas[ids.tareaAjena]).sort()).toEqual(['fechaLimite', 'idTarea', 'visibilidad']);

    for (const privado of PRIVADOS) expect(texto).not.toContain(privado);
  });

  it('el calendario personal del propietario no cambia: sigue viendo todo con sus campos completos', async () => {
    const res = await pedir(`/usuarios/me/eventos?${RANGO}`, tokens.owner);
    expect(res.status).toBe(200);
    const eventos = (await res.json()) as Record<string, unknown>[];
    const idsVistos = eventos.map((e) => e.idEvento as number).sort();
    expect(idsVistos).toEqual(Object.values(ids.eventos).sort());
    expect(eventos[0]).toHaveProperty('linkSesion');
    expect(eventos[0]).toHaveProperty('descripcionEvento');
    expect(eventos[0]).toHaveProperty('invitados');
  });

  // G04-C15 (UI-20, B-06): el tope de 62 días protege las dos rutas que usan GetEventsRangeQueryDto.
  it('G04-C15: un rango de más de 62 días o invertido responde 400 en mi calendario y en la agenda compartida; 62 días exactos pasan', async () => {
    const q = (desde: string, hasta: string) => `desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
    const EXACTO = q('2026-11-01T00:00:00.000Z', '2027-01-02T00:00:00.000Z'); // 62 días
    const EXCEDIDO = q('2026-11-01T00:00:00.000Z', '2027-01-02T00:00:00.001Z');
    const ANUAL = q('2020-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z');
    const INVERTIDO = q('2026-11-30T00:00:00.000Z', '2026-11-01T00:00:00.000Z');
    const agenda = `/usuarios/me/calendario/compartidos-conmigo/${ids.owner}/agenda`;

    for (const [ruta, token] of [['/usuarios/me/eventos', tokens.owner], [agenda, tokens.viewer]] as const) {
      expect((await pedir(`${ruta}?${EXACTO}`, token)).status).toBe(200);
      for (const rango of [EXCEDIDO, ANUAL]) {
        const res = await pedir(`${ruta}?${rango}`, token);
        expect(res.status).toBe(400);
        const cuerpo = await res.text();
        expect(cuerpo).toContain('no puede superar 62 días');
        expect(cuerpo).not.toContain('SECRETO');
      }
      const invertido = await pedir(`${ruta}?${INVERTIDO}`, token);
      expect(invertido.status).toBe(400);
      expect(await invertido.text()).toContain('hasta no puede ser anterior a desde');
    }
  });

  // G04-C15 (B-11): destinatarios admisibles contra la base real.
  it('G04-C15: compartir con un usuario INACTIVO, BLOQUEADO o inexistente responde 404 y no crea fila ni notifica', async () => {
    const inactivo = await createIntegrationUser(prisma, { nombre: 'Inactivo', apellido: 'G01' });
    const bloqueado = await createIntegrationUser(prisma, { nombre: 'Bloqueado', apellido: 'G01' });
    scope.userIds!.push(inactivo.idUsuario, bloqueado.idUsuario);
    await prisma.usuario.update({ where: { idUsuario: inactivo.idUsuario }, data: { estado: 'INACTIVO' } });
    await prisma.usuario.update({ where: { idUsuario: bloqueado.idUsuario }, data: { estado: 'BLOQUEADO' } });
    notifyFromTemplate.mockClear();

    for (const idUsuario of [inactivo.idUsuario, bloqueado.idUsuario, 2_000_000_000]) {
      const res = await pedir('/usuarios/me/calendario/compartidos', tokens.owner, { method: 'POST', body: JSON.stringify({ idUsuario }) });
      expect(res.status).toBe(404);
      expect(((await res.json()) as { message: string }).message).toBe('Usuario no encontrado');
    }
    expect(await prisma.calendarioCompartido.count({ where: { idPropietario: ids.owner, idInvitado: { in: [inactivo.idUsuario, bloqueado.idUsuario] } } })).toBe(0);
    expect(notifyFromTemplate).not.toHaveBeenCalled();
    // Un id que no es entero positivo ni siquiera llega al servicio.
    for (const idUsuario of [0, -3, 1.5, '7 OR 1=1']) {
      expect((await pedir('/usuarios/me/calendario/compartidos', tokens.owner, { method: 'POST', body: JSON.stringify({ idUsuario }) })).status).toBe(400);
    }
  });

  it('un rango inválido es rechazado por el ValidationPipe con 400', async () => {
    const res = await pedir(`/usuarios/me/calendario/compartidos-conmigo/${ids.owner}/agenda?desde=ayer&hasta=${encodeURIComponent(HASTA)}`, tokens.viewer);
    expect(res.status).toBe(400);
  });

  it('un tercero no puede revocar la relación ajena (eliminado: false) y el receptor sigue con acceso', async () => {
    const res = await pedir(`/usuarios/me/calendario/compartidos-conmigo/${ids.owner}`, tokens.externo, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ eliminado: false });
    const sigue = await pedir(`/usuarios/me/calendario/compartidos-conmigo/${ids.owner}/agenda?${RANGO}`, tokens.viewer);
    expect(sigue.status).toBe(200);
  });

  it('el receptor se quita el calendario, la lectura posterior es 403 y el propietario deja de listarlo', async () => {
    const res = await pedir(`/usuarios/me/calendario/compartidos-conmigo/${ids.owner}`, tokens.viewer, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ eliminado: true });

    const despues = await pedir(`/usuarios/me/calendario/compartidos-conmigo/${ids.owner}/agenda?${RANGO}`, tokens.viewer);
    expect(despues.status).toBe(403);

    const lista = await pedir('/usuarios/me/calendario/compartidos', tokens.owner);
    expect(lista.status).toBe(200);
    const json = (await lista.json()) as { compartidoPorMi: { idUsuario: number }[]; compartidosConmigo: unknown[] };
    expect(json.compartidoPorMi.some((p) => p.idUsuario === ids.viewer)).toBe(false);
  });

  it('volver a compartir (POST) crea la fila sin exponer el correo y no requiere aceptación para leer', async () => {
    const res = await pedir('/usuarios/me/calendario/compartidos', tokens.owner, { method: 'POST', body: JSON.stringify({ idUsuario: ids.viewer }) });
    expect(res.status).toBe(201);
    const json = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(json).sort()).toEqual(['apellido', 'fotoUrl', 'idUsuario', 'nombre']);
    expect(notifyFromTemplate).toHaveBeenCalledWith([ids.viewer], 'CALENDARIO_COMPARTIDO', expect.objectContaining({ ownerId: ids.owner }));

    const lectura = await pedir(`/usuarios/me/calendario/compartidos-conmigo/${ids.owner}/agenda?${RANGO}`, tokens.viewer);
    expect(lectura.status).toBe(200);
    const lista = await pedir('/usuarios/me/calendario/compartidos', tokens.viewer);
    const conmigo = ((await lista.json()) as { compartidosConmigo: Record<string, unknown>[] }).compartidosConmigo;
    expect(conmigo.find((p) => p.idUsuario === ids.owner)).not.toHaveProperty('correo');
  });
});
