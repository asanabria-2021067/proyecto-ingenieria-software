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
  const ids = { lider: 0, integrante: 0, proyecto: 0 };
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
});
