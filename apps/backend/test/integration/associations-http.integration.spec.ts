import 'reflect-metadata';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { PARAMTYPES_METADATA } from '@nestjs/common/constants';
import { NestFactory, Reflector } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import type { AddressInfo } from 'node:net';
import type { PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import { createIntegrationUser } from './setup/fixtures';
import { JwtStrategy } from '../../src/auth/jwt.strategy';
import { getJwtSecret } from '../../src/config/jwt-secret';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { AdminAssociationsController } from '../../src/associations/admin-associations.controller';
import { AssociationsController } from '../../src/associations/associations.controller';
import { AssociationsService } from '../../src/associations/associations.service';
import { JuntaGuard } from '../../src/associations/junta.guard';
import { assertPuedePublicarComoAsociacion } from '../../src/associations/junta-access';
import { CreateAsociacionDto } from '../../src/associations/dto/create-asociacion.dto';
import { UpdateAsociacionDto } from '../../src/associations/dto/update-asociacion.dto';
import { ActualizarJuntaDto, AsignarJuntaDto } from '../../src/associations/dto/junta.dto';
import type { NotificationsGateway } from '../../src/notifications/notifications.gateway';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const cookieParser = require('cookie-parser') as () => unknown;

function definirParamtypes() {
  const clases: [unknown, unknown[]][] = [
    [AdminAssociationsController, [AssociationsService]],
    [AssociationsController, [AssociationsService]],
    [JuntaGuard, [PrismaService]],
    [RolesGuard, [Reflector, PrismaService]],
    [JwtStrategy, [PrismaService]],
  ];
  for (const [clase, deps] of clases) {
    if (!Reflect.getMetadata(PARAMTYPES_METADATA, clase as object)) Reflect.defineMetadata(PARAMTYPES_METADATA, deps, clase as object);
  }
  const handlers: [string, unknown[]][] = [
    ['create', [CreateAsociacionDto, Object]],
    ['update', [Number, UpdateAsociacionDto, Object]],
    ['asignar', [Number, AsignarJuntaDto, Object]],
    ['actualizar', [Number, Number, ActualizarJuntaDto, Object]],
  ];
  for (const [nombre, tipos] of handlers) {
    Reflect.defineMetadata(PARAMTYPES_METADATA, tipos, AdminAssociationsController.prototype, nombre);
  }
}

describeIntegration('asociaciones y juntas — contrato HTTP (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let url: string;
  const marca = `${Date.now()}`;
  const ids = { admin: 0, presidente: 0, vocal: 0, estudiante: 0, otro: 0, rolAdmin: 0, carrera: 0, asociacion: 0 };
  let vinculo = 0;
  let rolAdminCreado = false;
  const tokens: Record<string, string> = {};

  const pedir = (metodo: string, ruta: string, quien: keyof typeof tokens | null, body?: unknown) =>
    fetch(`${url}${ruta}`, {
      method: metodo,
      headers: { 'content-type': 'application/json', ...(quien ? { cookie: `access_token=${tokens[quien]}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
    definirParamtypes();
    const notifications = new NotificationsService(
      prisma as unknown as PrismaService,
      { notifyUsers: vi.fn().mockResolvedValue(undefined), emitToUsers: vi.fn() } as unknown as NotificationsGateway,
    );

    @Module({
      imports: [PassportModule],
      controllers: [AdminAssociationsController, AssociationsController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        JwtStrategy,
        RolesGuard,
        JuntaGuard,
        { provide: AssociationsService, useFactory: () => new AssociationsService(prisma as unknown as PrismaService, notifications) },
      ],
    })
    class HarnessModule {}

    app = await NestFactory.create(HarnessModule, { logger: false });
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`;

    const crear = async (nombre: string) => createIntegrationUser(prisma, { nombre, apellido: `Aso ${marca}` });
    const [admin, presidente, vocal, estudiante, otro] = await Promise.all(
      ['Admin', 'Presidente', 'Vocal', 'Estudiante', 'Otro'].map(crear),
    );
    ids.admin = admin.idUsuario;
    ids.presidente = presidente.idUsuario;
    ids.vocal = vocal.idUsuario;
    ids.estudiante = estudiante.idUsuario;
    ids.otro = otro.idUsuario;

    const rolExistente = await prisma.rolAcceso.findUnique({ where: { nombrePerfil: 'administrador' } });
    rolAdminCreado = !rolExistente;
    const rol = rolExistente ?? (await prisma.rolAcceso.create({ data: { nombrePerfil: 'administrador' } }));
    ids.rolAdmin = rol.idRolAcceso;
    vinculo = (await prisma.usuarioRolAcceso.create({ data: { idUsuario: ids.admin, idRolAcceso: rol.idRolAcceso } })).idUsuarioRolAcceso;
    ids.carrera = (await prisma.carrera.create({ data: { nombreCarrera: `Carrera Aso ${marca}` } })).idCarrera;

    const jwt = new JwtService({ secret: getJwtSecret() });
    for (const [clave, u] of Object.entries({ admin, presidente, vocal, estudiante, otro })) {
      tokens[clave] = jwt.sign({ sub: u.idUsuario, correo: u.correo, tipo: 'access' });
    }
  }, 60_000);

  afterAll(async () => {
    try {
      const usuarios = [ids.admin, ids.presidente, ids.vocal, ids.estudiante, ids.otro].filter((id) => id > 0);
      await prisma.proyecto.deleteMany({ where: { idAsociacion: ids.asociacion || -1 } });
      await prisma.asociacion.deleteMany({ where: { nombre: { endsWith: marca } } });
      await prisma.bitacoraAuditoria.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.notificacion.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.usuarioRolAcceso.deleteMany({ where: { idUsuarioRolAcceso: vinculo } });
      await prisma.usuario.deleteMany({ where: { idUsuario: { in: usuarios } } });
      if (ids.carrera) await prisma.carrera.deleteMany({ where: { idCarrera: ids.carrera } });
      if (rolAdminCreado) await prisma.rolAcceso.delete({ where: { idRolAcceso: ids.rolAdmin } });
    } finally {
      await app?.close();
      await prisma.$disconnect();
    }
  }, 60_000);

  it('solo el admin del sistema crea asociaciones', async () => {
    const cuerpo = { nombre: `Asociación ${marca}`, descripcion: 'Prueba', idsCarreras: [ids.carrera] };

    expect((await pedir('POST', '/admin/asociaciones', null, cuerpo)).status).toBe(401);
    for (const quien of ['estudiante', 'presidente'] as const) {
      expect((await pedir('POST', '/admin/asociaciones', quien, cuerpo)).status).toBe(403);
    }
    expect(await prisma.asociacion.count({ where: { nombre: cuerpo.nombre } })).toBe(0);

    const res = await pedir('POST', '/admin/asociaciones', 'admin', cuerpo);
    expect(res.status).toBe(201);
    const creada = await res.json();
    ids.asociacion = creada.idAsociacion;
    expect(creada.carreras).toHaveLength(1);
    expect(await prisma.bitacoraAuditoria.count({ where: { accion: 'ASOCIACION_CREADA', idObjeto: String(ids.asociacion) } })).toBe(1);

    expect((await pedir('POST', '/admin/asociaciones', 'admin', cuerpo)).status).toBe(409);
    expect((await pedir('POST', '/admin/asociaciones', 'admin', { ...cuerpo, nombre: `Otra ${marca}`, idsCarreras: [] })).status).toBe(400);
  });

  it('solo el admin nombra la junta; aplica el nivel por defecto, audita y notifica', async () => {
    const ruta = `/admin/asociaciones/${ids.asociacion}/junta`;

    expect((await pedir('POST', ruta, 'presidente', { idUsuario: ids.presidente, cargo: 'PRESIDENTE' })).status).toBe(403);
    expect((await pedir('POST', ruta, 'estudiante', { idUsuario: ids.estudiante, cargo: 'PRESIDENTE' })).status).toBe(403);
    expect(await prisma.juntaAsociacion.count({ where: { idAsociacion: ids.asociacion } })).toBe(0);

    const pres = await pedir('POST', ruta, 'admin', { idUsuario: ids.presidente, cargo: 'PRESIDENTE' });
    expect(pres.status).toBe(201);
    expect(await pres.json()).toMatchObject({ cargo: 'PRESIDENTE', nivelPermiso: 'ADMINISTRADOR', asignadoPor: ids.admin });

    const voc = await pedir('POST', ruta, 'admin', { idUsuario: ids.vocal, cargo: 'VOCAL' });
    expect(voc.status).toBe(201);
    expect(await voc.json()).toMatchObject({ nivelPermiso: 'LECTURA' });

    expect(await prisma.bitacoraAuditoria.count({ where: { accion: 'JUNTA_ASIGNADA', idObjeto: String(ids.asociacion) } })).toBe(2);
    const aviso = await prisma.notificacion.findFirst({ where: { idUsuario: ids.presidente, tipoNotificacion: 'JUNTA_ASOCIACION' } });
    expect(aviso?.mensajeNotificacion).toContain('Presidente');
  });

  it('un cargo y un usuario no se repiten dentro de la junta', async () => {
    const ruta = `/admin/asociaciones/${ids.asociacion}/junta`;
    expect((await pedir('POST', ruta, 'admin', { idUsuario: ids.otro, cargo: 'PRESIDENTE' })).status).toBe(409);
    expect((await pedir('POST', ruta, 'admin', { idUsuario: ids.presidente, cargo: 'TESORERO' })).status).toBe(409);
  });

  it('«mis juntas» lista solo las juntas propias', async () => {
    const res = await pedir('GET', '/asociaciones/mis-juntas', 'vocal');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      expect.objectContaining({ idAsociacion: ids.asociacion, cargo: 'VOCAL', nivelPermiso: 'LECTURA' }),
    ]);
    expect(await (await pedir('GET', '/asociaciones/mis-juntas', 'estudiante')).json()).toEqual([]);
    expect((await pedir('GET', '/asociaciones/mis-juntas', null)).status).toBe(401);
  });

  it('un estudiante que no es de la junta recibe 403 en las rutas de asociación; la junta pasa', async () => {
    const ruta = `/asociaciones/${ids.asociacion}/membresia`;
    expect((await pedir('GET', ruta, null)).status).toBe(401);
    expect((await pedir('GET', ruta, 'estudiante')).status).toBe(403);
    expect((await pedir('GET', ruta, 'admin')).status).toBe(403);
    const ok = await pedir('GET', ruta, 'vocal');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ idAsociacion: ids.asociacion, cargo: 'VOCAL', nivelPermiso: 'LECTURA' });
  });

  it('solo el Presidente y los Editores publican a nombre de la asociación', async () => {
    await expect(assertPuedePublicarComoAsociacion(prisma, ids.asociacion, ids.presidente)).resolves.toBeUndefined();
    await expect(assertPuedePublicarComoAsociacion(prisma, ids.asociacion, ids.vocal)).rejects.toMatchObject({ status: 403 });
    await expect(assertPuedePublicarComoAsociacion(prisma, ids.asociacion, ids.estudiante)).rejects.toMatchObject({ status: 403 });

    const subido = await pedir('PATCH', `/admin/asociaciones/${ids.asociacion}/junta/${ids.vocal}`, 'admin', { nivelPermiso: 'EDITOR' });
    expect(subido.status).toBe(200);
    await expect(assertPuedePublicarComoAsociacion(prisma, ids.asociacion, ids.vocal)).resolves.toBeUndefined();
  });

  it('el admin quita integrantes y archiva; el miembro quitado pierde el acceso', async () => {
    const quitar = await pedir('DELETE', `/admin/asociaciones/${ids.asociacion}/junta/${ids.vocal}`, 'admin');
    expect(quitar.status).toBe(200);
    expect((await pedir('GET', `/asociaciones/${ids.asociacion}/membresia`, 'vocal')).status).toBe(403);
    expect(await prisma.bitacoraAuditoria.count({ where: { accion: 'JUNTA_REMOVIDA', idObjeto: String(ids.asociacion) } })).toBe(1);

    expect((await pedir('PATCH', `/admin/asociaciones/${ids.asociacion}`, 'presidente', { archivada: true })).status).toBe(403);
    const archivar = await pedir('PATCH', `/admin/asociaciones/${ids.asociacion}`, 'admin', { archivada: true });
    expect(archivar.status).toBe(200);
    expect(await prisma.bitacoraAuditoria.count({ where: { accion: 'ASOCIACION_ARCHIVADA', idObjeto: String(ids.asociacion) } })).toBe(1);
    expect(await (await pedir('GET', '/asociaciones/mis-juntas', 'presidente')).json()).toEqual([]);
    await expect(assertPuedePublicarComoAsociacion(prisma, ids.asociacion, ids.presidente)).rejects.toMatchObject({ status: 403 });
    expect((await pedir('POST', `/admin/asociaciones/${ids.asociacion}/junta`, 'admin', { idUsuario: ids.otro, cargo: 'VOCAL' })).status).toBe(400);
  });
});
