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
import { AdminController } from '../../src/admin/admin.controller';
import { AdminService } from '../../src/admin/admin.service';
import { UpdateAdminUserStatusDto } from '../../src/admin/dto/update-admin-user-status.dto';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService, MENSAJE_CUENTA_PENDIENTE } from '../../src/auth/auth.service';
import { LoginDto } from '../../src/auth/dto/login.dto';
import { RegisterDto } from '../../src/auth/dto/register.dto';
import { JwtStrategy } from '../../src/auth/jwt.strategy';
import { ADMIN_ONLY_MESSAGE, RolesGuard } from '../../src/common/guards/roles.guard';
import { getJwtSecret } from '../../src/config/jwt-secret';
import type { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SecurityEventsService } from '../../src/security-events/security-events.service';

const cookieParser = require('cookie-parser') as () => unknown;

process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';

/**
 * Contrato HTTP real del flujo de verificación de cuentas contra PostgreSQL
 * (base desechable, `INTEGRATION_DATABASE_URL`). Igual que
 * calendar-shares-http.integration.spec.ts: módulo mínimo con `NestFactory`,
 * controllers, services, `JwtStrategy` y `RolesGuard` REALES y el
 * `ValidationPipe` global de main.ts. Solo las notificaciones son un doble.
 */
const CONTRASENA = 'Correcta123';

function definirParamtypes() {
  const tabla: [unknown, unknown[]][] = [
    [AuthController, [AuthService]],
    [AdminController, [AdminService]],
    [JwtStrategy, [PrismaService]],
    [RolesGuard, [Reflector, PrismaService]],
  ];
  for (const [clase, deps] of tabla) {
    if (!Reflect.getMetadata(PARAMTYPES_METADATA, clase as object)) {
      Reflect.defineMetadata(PARAMTYPES_METADATA, deps, clase as object);
    }
  }
  // Tipos de los parámetros de cada handler: sin ellos el ValidationPipe no sabe contra qué DTO validar @Body.
  const handlers: [object, string, unknown[]][] = [
    [AuthController.prototype, 'login', [LoginDto, Object, Object]],
    [AuthController.prototype, 'register', [RegisterDto]],
    [AdminController.prototype, 'updateUsuarioEstado', [Object, Number, UpdateAdminUserStatusDto, Object]],
  ];
  for (const [proto, nombre, tipos] of handlers) {
    if (!Reflect.getMetadata(PARAMTYPES_METADATA, proto, nombre)) {
      Reflect.defineMetadata(PARAMTYPES_METADATA, tipos, proto, nombre);
    }
  }
}

describeIntegration('verificación de cuentas — contrato HTTP (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let url: string;
  const notifyAdminsFromTemplate = vi.fn().mockResolvedValue(undefined);
  const notifyFromTemplate = vi.fn().mockResolvedValue(undefined);
  const ids = { admin: 0, estudiante: 0, carrera: 0, rolAdmin: 0, porAprobar: 0, porRechazar: 0 };
  const tokens = { admin: '', estudiante: '' };
  let rolAdminCreado = false;
  const marca = `${Date.now()}`;
  // El correo institucional es <3 letras del apellido><carné>@uvg.edu.gt.
  const registro = (carne: string) => ({
    correo: `gat${carne}@uvg.edu.gt`,
    contrasena: CONTRASENA,
    nombre: 'Cuenta',
    apellido: 'Gate',
    carne,
    idCarrera: ids.carrera,
    semestre: 4,
  });
  const porAprobar = () => registro(`1${marca}`);
  const porRechazar = () => registro(`2${marca}`);

  const pedir = (ruta: string, token: string | null, init: RequestInit = {}) =>
    fetch(`${url}${ruta}`, {
      ...init,
      headers: { ...(token ? { cookie: `access_token=${token}` } : {}), 'content-type': 'application/json' },
    });
  const post = (ruta: string, body: unknown) => pedir(ruta, null, { method: 'POST', body: JSON.stringify(body) });
  const patch = (ruta: string, token: string | null, body?: unknown) =>
    pedir(ruta, token, { method: 'PATCH', ...(body ? { body: JSON.stringify(body) } : {}) });
  const estadoDe = async (idUsuario: number) =>
    (await prisma.usuario.findUniqueOrThrow({ where: { idUsuario }, select: { estado: true } })).estado;
  const mensajeDe = async (res: Response) => ((await res.json()) as { message: string }).message;

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
    definirParamtypes();
    const notifications = { notifyAdminsFromTemplate, notifyFromTemplate } as unknown as NotificationsService;

    @Module({
      imports: [PassportModule],
      controllers: [AuthController, AdminController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        JwtStrategy,
        RolesGuard,
        {
          provide: AuthService,
          useFactory: () => new AuthService(prisma as unknown as PrismaService, new JwtService({}), notifications),
        },
        {
          provide: AdminService,
          useFactory: () =>
            new AdminService(
              prisma as unknown as PrismaService,
              new JwtService({}),
              new SecurityEventsService(prisma as unknown as PrismaService),
              undefined,
              notifications,
            ),
        },
      ],
    })
    class HarnessModule {}

    app = await NestFactory.create(HarnessModule, { logger: false });
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`;

    const admin = await createIntegrationUser(prisma, { nombre: 'Admin', apellido: 'Gate' });
    const estudiante = await createIntegrationUser(prisma, { nombre: 'Estudiante', apellido: 'Activo' });
    ids.admin = admin.idUsuario;
    ids.estudiante = estudiante.idUsuario;
    const rolExistente = await prisma.rolAcceso.findUnique({ where: { nombrePerfil: 'administrador' } });
    rolAdminCreado = !rolExistente;
    const rol = rolExistente ?? (await prisma.rolAcceso.create({ data: { nombrePerfil: 'administrador' } }));
    ids.rolAdmin = rol.idRolAcceso;
    await prisma.usuarioRolAcceso.create({ data: { idUsuario: admin.idUsuario, idRolAcceso: rol.idRolAcceso } });
    ids.carrera = (await prisma.carrera.create({ data: { nombreCarrera: `Carrera gate ${marca}` } })).idCarrera;

    const jwt = new JwtService({ secret: getJwtSecret() });
    const firmar = (u: { idUsuario: number; correo: string }) => jwt.sign({ sub: u.idUsuario, correo: u.correo, tipo: 'access' });
    tokens.admin = firmar(admin);
    tokens.estudiante = firmar(estudiante);
  }, 60_000);

  afterAll(async () => {
    try {
      const usuarios = [ids.admin, ids.estudiante, ids.porAprobar, ids.porRechazar].filter((id) => id > 0);
      await prisma.bitacoraAuditoria.deleteMany({
        where: { OR: [{ idUsuario: { in: usuarios } }, { idObjeto: { in: usuarios.map(String) } }] },
      });
      await prisma.tokenRefresco.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.usuarioRolAcceso.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.perfilEstudiante.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.usuario.deleteMany({ where: { idUsuario: { in: usuarios } } });
      if (ids.carrera) await prisma.carrera.delete({ where: { idCarrera: ids.carrera } });
      if (rolAdminCreado) await prisma.rolAcceso.delete({ where: { idRolAcceso: ids.rolAdmin } });
    } finally {
      await app?.close();
      await prisma.$disconnect();
    }
  }, 60_000);

  it('el registro deja la cuenta en PENDIENTE_VERIFICACION, avisa a administración y no abre sesión', async () => {
    for (const [clave, datos] of [['porAprobar', porAprobar()], ['porRechazar', porRechazar()]] as const) {
      const res = await post('/auth/register', datos);

      expect(res.status).toBe(201);
      expect(res.headers.getSetCookie()).toEqual([]);
      const cuenta = await prisma.usuario.findUniqueOrThrow({ where: { correo: datos.correo } });
      expect(cuenta.estado).toBe('PENDIENTE_VERIFICACION');
      expect(await prisma.tokenRefresco.count({ where: { idUsuario: cuenta.idUsuario } })).toBe(0);
      ids[clave] = cuenta.idUsuario;
    }
    expect(notifyAdminsFromTemplate).toHaveBeenCalledWith('CUENTA_PENDIENTE_VERIFICACION', {
      userName: 'Cuenta Gate',
      carne: porAprobar().carne,
      userId: ids.porAprobar,
    });
  });

  it('una cuenta pendiente no inicia sesión (403) ni pasa la validación del JWT (401)', async () => {
    const { correo } = porAprobar();
    const login = await post('/auth/login', { correo, contrasena: CONTRASENA });

    expect(login.status).toBe(403);
    expect(login.headers.getSetCookie()).toEqual([]);
    expect(await mensajeDe(login)).toBe(MENSAJE_CUENTA_PENDIENTE);
    expect(await prisma.tokenRefresco.count({ where: { idUsuario: ids.porAprobar } })).toBe(0);

    // Un access token bien firmado no basta mientras la cuenta siga pendiente.
    const forjado = new JwtService({ secret: getJwtSecret() }).sign({ sub: ids.porAprobar, correo, tipo: 'access' });
    expect((await pedir('/admin/cuentas-pendientes', forjado)).status).toBe(401);
  });

  it('el listado exige sesión (401) y rol de administrador (403); administración ve las cuentas y el total', async () => {
    expect((await pedir('/admin/cuentas-pendientes', null)).status).toBe(401);

    const sinRol = await pedir('/admin/cuentas-pendientes', tokens.estudiante);
    expect(sinRol.status).toBe(403);
    expect(await mensajeDe(sinRol)).toBe(ADMIN_ONLY_MESSAGE);

    const res = await pedir('/admin/cuentas-pendientes', tokens.admin);
    expect(res.status).toBe(200);
    const { total, cuentas } = (await res.json()) as { total: number; cuentas: Record<string, unknown>[] };
    expect(total).toBe(cuentas.length);
    expect(total).toBe(await prisma.usuario.count({ where: { estado: 'PENDIENTE_VERIFICACION' } }));
    const cuenta = cuentas.find((c) => c.idUsuario === ids.porAprobar);
    expect(cuenta).toMatchObject({
      nombre: 'Cuenta',
      apellido: 'Gate',
      correo: porAprobar().correo,
      carne: porAprobar().carne,
      carrera: { idCarrera: ids.carrera, nombreCarrera: `Carrera gate ${marca}` },
    });
    expect(cuenta).not.toHaveProperty('contrasena');
    expect(cuentas.map((c) => c.idUsuario)).toContain(ids.porRechazar);
  });

  it.each(['aprobar', 'rechazar'])('%s exige sesión (401) y rol de administrador (403) sin tocar la cuenta', async (accion) => {
    const ruta = `/admin/cuentas-pendientes/${ids.porAprobar}/${accion}`;

    expect((await patch(ruta, null)).status).toBe(401);
    expect((await patch(ruta, tokens.estudiante)).status).toBe(403);
    expect(await estadoDe(ids.porAprobar)).toBe('PENDIENTE_VERIFICACION');
  });

  it.each(['aprobar', 'rechazar'])('%s responde 404 si la cuenta no existe y 400 si el id no es numérico', async (accion) => {
    expect((await patch(`/admin/cuentas-pendientes/2147483647/${accion}`, tokens.admin)).status).toBe(404);
    expect((await patch(`/admin/cuentas-pendientes/abc/${accion}`, tokens.admin)).status).toBe(400);
  });

  it('el cambio de estado genérico no resuelve una cuenta pendiente (409) ni puede asignar ese estado (400)', async () => {
    const atajo = await patch(`/admin/usuarios/${ids.porAprobar}/estado`, tokens.admin, { estado: 'ACTIVO' });
    expect(atajo.status).toBe(409);
    expect(await estadoDe(ids.porAprobar)).toBe('PENDIENTE_VERIFICACION');

    const devolver = await patch(`/admin/usuarios/${ids.estudiante}/estado`, tokens.admin, { estado: 'PENDIENTE_VERIFICACION' });
    expect(devolver.status).toBe(400);
    expect(await estadoDe(ids.estudiante)).toBe('ACTIVO');
  });

  it('aprobar activa la cuenta, deja evento y aviso, y solo entonces el estudiante inicia sesión', async () => {
    const res = await patch(`/admin/cuentas-pendientes/${ids.porAprobar}/aprobar`, tokens.admin);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ idUsuario: ids.porAprobar, estado: 'ACTIVO' });
    expect(await estadoDe(ids.porAprobar)).toBe('ACTIVO');
    expect(notifyFromTemplate).toHaveBeenCalledWith([ids.porAprobar], 'CUENTA_VERIFICADA', { userName: 'Cuenta' });
    const evento = await prisma.bitacoraAuditoria.findFirstOrThrow({
      where: { accion: 'USER_STATUS_CHANGED', idObjeto: String(ids.porAprobar) },
    });
    expect(evento.idUsuario).toBe(ids.admin);
    expect(evento.detalleJson).toMatchObject({ estadoAnterior: 'PENDIENTE_VERIFICACION', estadoNuevo: 'ACTIVO' });

    const listado = (await (await pedir('/admin/cuentas-pendientes', tokens.admin)).json()) as { cuentas: { idUsuario: number }[] };
    expect(listado.cuentas.map((c) => c.idUsuario)).not.toContain(ids.porAprobar);

    const login = await post('/auth/login', { correo: porAprobar().correo, contrasena: CONTRASENA });
    expect(login.status).toBe(201);
    const cookie = login.headers.getSetCookie().find((c) => c.startsWith('access_token='));
    expect(cookie).toBeDefined();
    // Ya autenticada, la cuenta aprobada sigue sin ser administradora.
    const token = cookie!.split(';')[0].slice('access_token='.length);
    expect((await pedir('/admin/cuentas-pendientes', token)).status).toBe(403);
  });

  it('una cuenta ya aprobada no se vuelve a resolver (409)', async () => {
    expect((await patch(`/admin/cuentas-pendientes/${ids.porAprobar}/aprobar`, tokens.admin)).status).toBe(409);
    expect((await patch(`/admin/cuentas-pendientes/${ids.porAprobar}/rechazar`, tokens.admin)).status).toBe(409);
    expect(await estadoDe(ids.porAprobar)).toBe('ACTIVO');
  });

  it('rechazar pasa la cuenta a INACTIVO sin avisarle, y esta no inicia sesión ni se puede volver a resolver', async () => {
    notifyFromTemplate.mockClear();
    const res = await patch(`/admin/cuentas-pendientes/${ids.porRechazar}/rechazar`, tokens.admin);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ idUsuario: ids.porRechazar, estado: 'INACTIVO' });
    expect(await estadoDe(ids.porRechazar)).toBe('INACTIVO');
    expect(notifyFromTemplate).not.toHaveBeenCalled();
    const evento = await prisma.bitacoraAuditoria.findFirstOrThrow({
      where: { accion: 'USER_STATUS_CHANGED', idObjeto: String(ids.porRechazar) },
    });
    expect(evento.detalleJson).toMatchObject({ estadoAnterior: 'PENDIENTE_VERIFICACION', estadoNuevo: 'INACTIVO' });

    // La cuenta rechazada recibe la respuesta genérica, no la de «pendiente».
    const login = await post('/auth/login', { correo: porRechazar().correo, contrasena: CONTRASENA });
    expect(login.status).toBe(401);
    expect(login.headers.getSetCookie()).toEqual([]);
    expect(await mensajeDe(login)).toBe('Credenciales inválidas');

    expect((await patch(`/admin/cuentas-pendientes/${ids.porRechazar}/rechazar`, tokens.admin)).status).toBe(409);
    expect((await patch(`/admin/cuentas-pendientes/${ids.porRechazar}/aprobar`, tokens.admin)).status).toBe(409);
    expect(await estadoDe(ids.porRechazar)).toBe('INACTIVO');
  });
});
