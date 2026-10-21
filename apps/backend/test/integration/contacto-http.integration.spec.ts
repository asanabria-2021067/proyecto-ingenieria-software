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
import { createIntegrationUser } from './setup/fixtures';
import { JwtStrategy } from '../../src/auth/jwt.strategy';
import { getJwtSecret } from '../../src/config/jwt-secret';
import { ContactoController } from '../../src/contacto/contacto.controller';
import { ContactoService, MENSAJE_CONTACTO_ENVIADO } from '../../src/contacto/contacto.service';
import { CreateContactoDto } from '../../src/contacto/dto/create-contacto.dto';
import type { NotificationsGateway } from '../../src/notifications/notifications.gateway';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const cookieParser = require('cookie-parser') as () => unknown;

function definirParamtypes() {
  const tabla: [unknown, unknown[]][] = [
    [ContactoController, [ContactoService]],
    [JwtStrategy, [PrismaService]],
  ];
  for (const [clase, deps] of tabla) {
    if (!Reflect.getMetadata(PARAMTYPES_METADATA, clase as object)) {
      Reflect.defineMetadata(PARAMTYPES_METADATA, deps, clase as object);
    }
  }
  if (!Reflect.getMetadata(PARAMTYPES_METADATA, ContactoController.prototype, 'enviar')) {
    Reflect.defineMetadata(PARAMTYPES_METADATA, [CreateContactoDto, Object], ContactoController.prototype, 'enviar');
  }
}

describeIntegration('contacto — contrato HTTP (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let url: string;
  const ids = { admin: 0, otroAdmin: 0, estudiante: 0, rolAdmin: 0 };
  const vinculos: number[] = [];
  let rolAdminCreado = false;
  let tokenEstudiante = '';
  const marca = `${Date.now()}`;
  const inicio = new Date();
  const formulario = (asunto: string) => ({
    nombre: 'Visitante Contacto',
    correo: 'visitante@example.test',
    asunto,
    mensaje: `Mensaje de integración ${marca}`,
  });

  const enviar = (body: unknown, cookie?: string) =>
    fetch(`${url}/contacto`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });
  const notificacionesDe = (idUsuario: number, asunto: string) =>
    prisma.notificacion.findMany({
      where: {
        idUsuario,
        tipoNotificacion: 'SOLICITUD_CONTACTO',
        creadaEn: { gte: inicio },
        datosJson: { path: ['asunto'], equals: asunto },
      },
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
      controllers: [ContactoController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        JwtStrategy,
        { provide: ContactoService, useFactory: () => new ContactoService(notifications) },
      ],
    })
    class HarnessModule {}

    app = await NestFactory.create(HarnessModule, { logger: false });
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`;

    const admin = await createIntegrationUser(prisma, { nombre: 'Admin', apellido: 'Contacto' });
    const otroAdmin = await createIntegrationUser(prisma, { nombre: 'Otro', apellido: 'Admin' });
    const estudiante = await createIntegrationUser(prisma, { nombre: 'Estudiante', apellido: 'Contacto' });
    ids.admin = admin.idUsuario;
    ids.otroAdmin = otroAdmin.idUsuario;
    ids.estudiante = estudiante.idUsuario;
    const rolExistente = await prisma.rolAcceso.findUnique({ where: { nombrePerfil: 'administrador' } });
    rolAdminCreado = !rolExistente;
    const rol = rolExistente ?? (await prisma.rolAcceso.create({ data: { nombrePerfil: 'administrador' } }));
    ids.rolAdmin = rol.idRolAcceso;
    for (const idUsuario of [admin.idUsuario, otroAdmin.idUsuario]) {
      const vinculo = await prisma.usuarioRolAcceso.create({ data: { idUsuario, idRolAcceso: rol.idRolAcceso } });
      vinculos.push(vinculo.idUsuarioRolAcceso);
    }
    tokenEstudiante = new JwtService({ secret: getJwtSecret() }).sign({
      sub: estudiante.idUsuario,
      correo: estudiante.correo,
      tipo: 'access',
    });
  }, 60_000);

  afterAll(async () => {
    try {
      const usuarios = [ids.admin, ids.otroAdmin, ids.estudiante].filter((id) => id > 0);
      await prisma.notificacion.deleteMany({ where: { tipoNotificacion: 'SOLICITUD_CONTACTO', creadaEn: { gte: inicio } } });
      await prisma.usuarioRolAcceso.deleteMany({ where: { idUsuarioRolAcceso: { in: vinculos } } });
      await prisma.usuario.deleteMany({ where: { idUsuario: { in: usuarios } } });
      if (rolAdminCreado) await prisma.rolAcceso.delete({ where: { idRolAcceso: ids.rolAdmin } });
    } finally {
      await app?.close();
      await prisma.$disconnect();
    }
  }, 60_000);

  it('sin sesión crea una notificación para cada administrador y ninguna para quien no lo es', async () => {
    const asunto = `Anónimo ${marca}`;

    const res = await enviar(formulario(asunto));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ mensaje: MENSAJE_CONTACTO_ENVIADO });
    for (const idAdmin of [ids.admin, ids.otroAdmin]) {
      const [notificacion, ...resto] = await notificacionesDe(idAdmin, asunto);
      expect(resto).toEqual([]);
      expect(notificacion).toMatchObject({
        tituloNotificacion: 'Nueva solicitud de contacto',
        mensajeNotificacion: `Visitante Contacto (visitante@example.test) escribió sobre "${asunto}": Mensaje de integración ${marca}`,
        datosJson: { ...formulario(asunto), idUsuario: null },
        leidaEn: null,
      });
    }
    expect(await notificacionesDe(ids.estudiante, asunto)).toEqual([]);
  });

  it('con sesión guarda el id del usuario autenticado sin notificarle a él', async () => {
    const asunto = `Con sesión ${marca}`;

    const res = await enviar(formulario(asunto), `access_token=${tokenEstudiante}`);

    expect(res.status).toBe(201);
    const [notificacion] = await notificacionesDe(ids.admin, asunto);
    expect(notificacion.datosJson).toMatchObject({ idUsuario: ids.estudiante });
    expect(await notificacionesDe(ids.estudiante, asunto)).toEqual([]);
  });

  it('un formulario inválido responde 400 y no crea notificaciones', async () => {
    const asunto = `Inválido ${marca}`;

    const res = await enviar({ ...formulario(asunto), correo: 'no-es-correo', nombre: '' });

    expect(res.status).toBe(400);
    expect(await notificacionesDe(ids.admin, asunto)).toEqual([]);
  });
});
