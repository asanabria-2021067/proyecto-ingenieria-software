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
import { CreateReporteProblemaDto } from '../../src/reportes-problema/dto/create-reporte-problema.dto';
import { ListReportesProblemaQueryDto } from '../../src/reportes-problema/dto/list-reportes-problema-query.dto';
import { ReportesProblemaController } from '../../src/reportes-problema/reportes-problema.controller';
import { MENSAJE_REPORTE_ENVIADO, ReportesProblemaService } from '../../src/reportes-problema/reportes-problema.service';
import type { NotificationsGateway } from '../../src/notifications/notifications.gateway';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const cookieParser = require('cookie-parser') as () => unknown;

function definirParamtypes() {
  const tabla: [unknown, unknown[]][] = [
    [ReportesProblemaController, [ReportesProblemaService]],
    [JwtStrategy, [PrismaService]],
    [RolesGuard, [Reflector, PrismaService]],
  ];
  for (const [clase, deps] of tabla) {
    if (!Reflect.getMetadata(PARAMTYPES_METADATA, clase as object)) {
      Reflect.defineMetadata(PARAMTYPES_METADATA, deps, clase as object);
    }
  }
  const proto = ReportesProblemaController.prototype;
  const metodos: [string, unknown[]][] = [
    ['crear', [Object, CreateReporteProblemaDto]],
    ['listar', [Object, ListReportesProblemaQueryDto]],
    ['atender', [Object, Number]],
  ];
  for (const [nombre, tipos] of metodos) {
    if (!Reflect.getMetadata(PARAMTYPES_METADATA, proto, nombre)) {
      Reflect.defineMetadata(PARAMTYPES_METADATA, tipos, proto, nombre);
    }
  }
}

describeIntegration('reportes de problema: contrato HTTP (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let url: string;
  const ids = { admin: 0, estudiante: 0, rolAdmin: 0 };
  const vinculos: number[] = [];
  let rolAdminCreado = false;
  const tokens = { admin: '', estudiante: '' };
  const marca = `${Date.now()}`;
  const inicio = new Date();
  const reporte = (descripcion: string, extra: Record<string, unknown> = {}) => ({
    ruta: '/dashboard/proyectos/1',
    userAgent: 'Mozilla/5.0 integracion',
    descripcion,
    ...extra,
  });
  const llamar = (metodo: string, ruta: string, token?: string, body?: unknown) =>
    fetch(`${url}${ruta}`, {
      method: metodo,
      headers: { 'content-type': 'application/json', ...(token ? { cookie: `access_token=${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
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
      controllers: [ReportesProblemaController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        JwtStrategy,
        RolesGuard,
        { provide: ReportesProblemaService, useFactory: () => new ReportesProblemaService(prisma as unknown as PrismaService, notifications) },
      ],
    })
    class HarnessModule {}

    app = await NestFactory.create(HarnessModule, { logger: false });
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`;

    const admin = await createIntegrationUser(prisma, { nombre: 'Admin', apellido: 'Reportes' });
    const estudiante = await createIntegrationUser(prisma, { nombre: 'Estudiante', apellido: 'Reportes' });
    ids.admin = admin.idUsuario;
    ids.estudiante = estudiante.idUsuario;
    const rolExistente = await prisma.rolAcceso.findUnique({ where: { nombrePerfil: 'administrador' } });
    rolAdminCreado = !rolExistente;
    const rol = rolExistente ?? (await prisma.rolAcceso.create({ data: { nombrePerfil: 'administrador' } }));
    ids.rolAdmin = rol.idRolAcceso;
    const vinculo = await prisma.usuarioRolAcceso.create({ data: { idUsuario: admin.idUsuario, idRolAcceso: rol.idRolAcceso } });
    vinculos.push(vinculo.idUsuarioRolAcceso);
    const firmar = (u: { idUsuario: number; correo: string }) =>
      new JwtService({ secret: getJwtSecret() }).sign({ sub: u.idUsuario, correo: u.correo, tipo: 'access' });
    tokens.admin = firmar(admin);
    tokens.estudiante = firmar(estudiante);
  }, 60_000);

  afterAll(async () => {
    try {
      await prisma.reporteProblema.deleteMany({ where: { idUsuario: { in: [ids.admin, ids.estudiante] } } });
      await prisma.notificacion.deleteMany({ where: { tipoNotificacion: 'SOLICITUD_CONTACTO', creadaEn: { gte: inicio } } });
      await prisma.usuarioRolAcceso.deleteMany({ where: { idUsuarioRolAcceso: { in: vinculos } } });
      await prisma.usuario.deleteMany({ where: { idUsuario: { in: [ids.admin, ids.estudiante].filter((id) => id > 0) } } });
      if (rolAdminCreado) await prisma.rolAcceso.delete({ where: { idRolAcceso: ids.rolAdmin } });
    } finally {
      await app?.close();
      await prisma.$disconnect();
    }
  }, 60_000);

  it('sin sesión no se crea ningún reporte', async () => {
    const res = await llamar('POST', '/reportes-problema', undefined, reporte(`Anónimo ${marca}`));
    expect(res.status).toBe(401);
  });

  it('un estudiante crea un reporte y el administrador recibe el aviso', async () => {
    const descripcion = `Falla del tablero ${marca}`;
    const res = await llamar('POST', '/reportes-problema', tokens.estudiante, reporte(descripcion));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ mensaje: MENSAJE_REPORTE_ENVIADO });

    const guardado = await prisma.reporteProblema.findFirst({ where: { idUsuario: ids.estudiante, descripcion } });
    expect(guardado).toMatchObject({ estado: 'PENDIENTE', urlCaptura: null, ruta: '/dashboard/proyectos/1' });
    const avisos = await prisma.notificacion.findMany({
      where: { idUsuario: ids.admin, tipoNotificacion: 'SOLICITUD_CONTACTO', creadaEn: { gte: inicio } },
    });
    expect(avisos.length).toBeGreaterThan(0);
  });

  it('rechaza una captura que no es de Cloudinary y una descripción vacía', async () => {
    const a = await llamar('POST', '/reportes-problema', tokens.estudiante, reporte(`Captura ${marca}`, { urlCaptura: 'https://evil.example.com/x.png' }));
    expect(a.status).toBe(400);
    const b = await llamar('POST', '/reportes-problema', tokens.estudiante, reporte('   '));
    expect(b.status).toBe(400);
  });

  it('un no administrador recibe 403 al listar y al marcar atendido', async () => {
    const lista = await llamar('GET', '/admin/reportes-problema', tokens.estudiante);
    expect(lista.status).toBe(403);
    const atender = await llamar('PATCH', '/admin/reportes-problema/1/atender', tokens.estudiante);
    expect(atender.status).toBe(403);
  });

  it('el administrador lista los pendientes y los marca atendidos una sola vez', async () => {
    const descripcion = `Para atender ${marca}`;
    await llamar('POST', '/reportes-problema', tokens.estudiante, reporte(descripcion));

    const lista = await llamar('GET', '/admin/reportes-problema', tokens.admin);
    expect(lista.status).toBe(200);
    const items = (await lista.json()) as Array<{ idReporte: number; descripcion: string }>;
    const propio = items.find((r) => r.descripcion === descripcion);
    expect(propio).toBeDefined();

    const ok = await llamar('PATCH', `/admin/reportes-problema/${propio!.idReporte}/atender`, tokens.admin);
    expect(ok.status).toBe(200);
    expect(await prisma.reporteProblema.findUnique({ where: { idReporte: propio!.idReporte } })).toMatchObject({
      estado: 'ATENDIDO',
      atendidoPor: ids.admin,
    });
    const otraVez = await llamar('PATCH', `/admin/reportes-problema/${propio!.idReporte}/atender`, tokens.admin);
    expect(otraVez.status).toBe(409);
  });
});
