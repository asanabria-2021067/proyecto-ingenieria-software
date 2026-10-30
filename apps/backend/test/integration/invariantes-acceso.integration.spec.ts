import 'reflect-metadata';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { Controller, Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PARAMTYPES_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { NestFactory, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { AddressInfo } from 'node:net';
import type { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import { createIntegrationUser } from './setup/fixtures';
import { cargarRutas, RUTAS_PUBLICAS, type Ruta } from '../helpers/route-inventory';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import { LoginDto } from '../../src/auth/dto/login.dto';
import { RegisterDto } from '../../src/auth/dto/register.dto';
import { JwtStrategy } from '../../src/auth/jwt.strategy';
import { OptionalJwtAuthGuard } from '../../src/auth/optional-jwt-auth.guard';
import { JwtAuthGuard } from '../../src/auth/jwt-auth.guard';
import { ROLES_METADATA_KEY } from '../../src/common/decorators/roles.decorator';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { getJwtSecret } from '../../src/config/jwt-secret';
import type { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { UpdateProfileDto } from '../../src/users/dto/update-profile.dto';
import { UsersController } from '../../src/users/users.controller';
import { UsersService } from '../../src/users/users.service';
import { WsAuthService } from '../../src/ws-auth/ws-auth.service';

const cookieParser = require('cookie-parser') as () => unknown;

process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';

/**
 * Invariantes de acceso contra PostgreSQL real (base desechable
 * `INTEGRATION_DATABASE_URL`):
 *  (a) ninguna ruta protegida responde algo distinto de 401 sin token;
 *  (b) un estudiante recibe 403 en TODAS las rutas de administracion;
 *  (c) registrarse no abre sesion y una cuenta pendiente no obtiene tokens;
 *  (d) ningun payload de usuario puede cambiar roles, estado o administrador.
 *
 * (a) y (b) montan, por cada ruta REAL del inventario, una ruta gemela con la
 * misma metadata de guards y `@Roles` y un handler trivial, bajo los guards
 * reales (JwtAuthGuard + JwtStrategy + RolesGuard contra la base). Asi se
 * prueba el cableado de acceso de las ~270 rutas sin construir el arbol de DI
 * completo (el transform de Vitest no emite `design:paramtypes`).
 */
const CONTRASENA = 'Correcta123';
const METODOS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD'];

function gemela(ruta: Ruta, i: number): new () => object {
  class Gemela {
    handler() {
      return { ok: true };
    }
  }
  // Prefijo unico por ruta: ninguna gemela puede responder en lugar de otra.
  Controller(`t${i}`)(Gemela);
  Reflect.defineMetadata(PATH_METADATA, ruta.path, Gemela.prototype.handler);
  Reflect.defineMetadata(METHOD_METADATA, METODOS.indexOf(ruta.metodo), Gemela.prototype.handler);
  // Solo los guards de acceso: ProjectWriteGuard decide por proyecto, no por rol.
  const acceso = ruta.guards.filter((g) => g === JwtAuthGuard || g === OptionalJwtAuthGuard || g === RolesGuard);
  Reflect.defineMetadata(GUARDS_METADATA, acceso, Gemela);
  if (ruta.roles.length) Reflect.defineMetadata(ROLES_METADATA_KEY, ruta.roles, Gemela.prototype.handler);
  return Gemela;
}

const concreto = (i: number, path: string) => `/t${i}/${path.replace(/:[A-Za-z]+/g, '1')}`;

describeIntegration('invariantes de acceso (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let url: string;
  let rutas: Ruta[];
  const ids = { estudiante: 0, admin: 0, pendiente: 0, rolAdmin: 0 };
  let rolAdminCreado = false;
  const tokens = { estudiante: '' };
  const marca = `${Date.now()}`;
  const firmar = (u: { idUsuario: number; correo: string }) =>
    new JwtService({ secret: getJwtSecret() }).sign({ sub: u.idUsuario, correo: u.correo, tipo: 'access' });
  const llamar = (metodo: string, ruta: string, token?: string) =>
    fetch(`${url}${ruta}`, {
      method: metodo,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
      ...(metodo !== 'GET' && metodo !== 'DELETE' ? { body: '{}' } : {}),
    });
  const postJson = (ruta: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${url}${ruta}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
    rutas = await cargarRutas();

    const gemelas = rutas.map(gemela);
    const notifications = { notifyAdminsFromTemplate: vi.fn(), notifyFromTemplate: vi.fn() } as unknown as NotificationsService;
    const tabla: [unknown, unknown[]][] = [
      [AuthController, [AuthService]],
      [UsersController, [UsersService]],
      [JwtStrategy, [PrismaService]],
      [RolesGuard, [Reflector, PrismaService]],
    ];
    for (const [clase, deps] of tabla) {
      if (!Reflect.getMetadata(PARAMTYPES_METADATA, clase as object)) Reflect.defineMetadata(PARAMTYPES_METADATA, deps, clase as object);
    }
    const handlers: [object, string, unknown[]][] = [
      [AuthController.prototype, 'login', [LoginDto, Object, Object]],
      [AuthController.prototype, 'register', [RegisterDto]],
      [UsersController.prototype, 'updateProfile', [Object, UpdateProfileDto]],
    ];
    for (const [proto, nombre, tipos] of handlers) {
      if (!Reflect.getMetadata(PARAMTYPES_METADATA, proto, nombre)) Reflect.defineMetadata(PARAMTYPES_METADATA, tipos, proto, nombre);
    }

    const authService = new AuthService(prisma as unknown as PrismaService, new JwtService({}), notifications);
    @Module({
      imports: [PassportModule],
      controllers: [AuthController, UsersController, ...gemelas],
      providers: [
        { provide: PrismaService, useValue: prisma },
        JwtStrategy,
        RolesGuard,
        { provide: AuthService, useValue: authService },
        { provide: UsersService, useValue: new UsersService(prisma as unknown as PrismaService) },
      ],
    })
    class HarnessModule {}
    app = await NestFactory.create(HarnessModule, { logger: false, abortOnError: false });
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`;

    const hash = await bcrypt.hash(CONTRASENA, 10);
    const estudiante = await createIntegrationUser(prisma, { nombre: 'Estu', apellido: 'Inv', contrasena: hash });
    const admin = await createIntegrationUser(prisma, { nombre: 'Admin', apellido: 'Inv', contrasena: hash });
    const pendiente = await createIntegrationUser(prisma, { nombre: 'Pend', apellido: 'Inv', contrasena: hash });
    await prisma.usuario.update({ where: { idUsuario: pendiente.idUsuario }, data: { estado: 'PENDIENTE_VERIFICACION' } });
    Object.assign(ids, { estudiante: estudiante.idUsuario, admin: admin.idUsuario, pendiente: pendiente.idUsuario });
    const rolEstudiante =
      (await prisma.rolAcceso.findUnique({ where: { nombrePerfil: 'estudiante' } })) ??
      (await prisma.rolAcceso.create({ data: { nombrePerfil: 'estudiante' } }));
    const rolExistente = await prisma.rolAcceso.findUnique({ where: { nombrePerfil: 'administrador' } });
    rolAdminCreado = !rolExistente;
    const rolAdmin = rolExistente ?? (await prisma.rolAcceso.create({ data: { nombrePerfil: 'administrador' } }));
    ids.rolAdmin = rolAdmin.idRolAcceso;
    await prisma.usuarioRolAcceso.create({ data: { idUsuario: estudiante.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso } });
    await prisma.usuarioRolAcceso.create({ data: { idUsuario: admin.idUsuario, idRolAcceso: rolAdmin.idRolAcceso } });
    tokens.estudiante = firmar(estudiante);
  }, 120_000);

  afterAll(async () => {
    try {
      const usuarios = [ids.estudiante, ids.admin, ids.pendiente].filter((id) => id > 0);
      await prisma.tokenRefresco.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.usuarioRolAcceso.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.perfilEstudiante.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.bitacoraAuditoria.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.usuario.deleteMany({ where: { idUsuario: { in: usuarios } } });
      if (rolAdminCreado) await prisma.rolAcceso.delete({ where: { idRolAcceso: ids.rolAdmin } });
    } finally {
      await app?.close();
      await prisma.$disconnect();
    }
  }, 60_000);

  it('(a) toda ruta protegida responde 401 sin token', async () => {
    const distintas: string[] = [];
    let probadas = 0;
    for (const [i, r] of rutas.entries()) {
      if (RUTAS_PUBLICAS.has(r.id)) continue;
      probadas += 1;
      const res = await llamar(r.metodo, concreto(i, r.path));
      if (res.status !== 401) distintas.push(`${r.id} -> ${res.status}`);
    }
    expect(probadas).toBeGreaterThan(200);
    expect(distintas).toEqual([]);
  }, 120_000);

  it('(b) un estudiante recibe 403 en todas las rutas de administracion (GET, POST, PATCH y DELETE)', async () => {
    expect([...new Set(rutas.filter((r) => r.adminPath).map((r) => r.metodo))].sort()).toEqual(['DELETE', 'GET', 'PATCH', 'POST']);
    const distintas: string[] = [];
    for (const [i, r] of rutas.entries()) {
      if (!r.adminPath) continue;
      const res = await llamar(r.metodo, concreto(i, r.path), tokens.estudiante);
      if (res.status !== 403) distintas.push(`${r.id} -> ${res.status}`);
    }
    expect(distintas).toEqual([]);
  }, 120_000);

  it('(c) el registro no devuelve Set-Cookie y la cuenta queda pendiente sin tokens', async () => {
    const carrera = await prisma.carrera.create({ data: { nombreCarrera: `Carrera inv ${marca}` } });
    const carne = `3${marca}`;
    const correo = `inv${carne}@uvg.edu.gt`;
    try {
      const res = await postJson('/auth/register', {
        correo,
        contrasena: CONTRASENA,
        nombre: 'Nueva',
        apellido: 'Inv',
        carne,
        idCarrera: carrera.idCarrera,
        semestre: 3,
      });
      expect(res.status).toBe(201);
      expect(res.headers.getSetCookie()).toEqual([]);
      const cuenta = await prisma.usuario.findUniqueOrThrow({ where: { correo } });
      expect(cuenta.estado).toBe('PENDIENTE_VERIFICACION');
      expect(await prisma.tokenRefresco.count({ where: { idUsuario: cuenta.idUsuario } })).toBe(0);
      await prisma.perfilEstudiante.deleteMany({ where: { idUsuario: cuenta.idUsuario } });
      await prisma.bitacoraAuditoria.deleteMany({ where: { idUsuario: cuenta.idUsuario } });
      await prisma.usuario.delete({ where: { idUsuario: cuenta.idUsuario } });
    } finally {
      await prisma.carrera.delete({ where: { idCarrera: carrera.idCarrera } });
    }
  });

  it('(c) una cuenta pendiente no obtiene tokens en login ni en refresh, y su JWT firmado a mano no entra por HTTP ni por WebSocket', async () => {
    const pendiente = await prisma.usuario.findUniqueOrThrow({ where: { idUsuario: ids.pendiente } });
    const login = await postJson('/auth/login', { correo: pendiente.correo, contrasena: CONTRASENA });
    expect(login.status).toBe(403);
    expect(login.headers.getSetCookie()).toEqual([]);

    // Un refresh emitido cuando la cuenta estaba activa deja de servir al pasar a pendiente.
    const activa = await prisma.usuario.findUniqueOrThrow({ where: { idUsuario: ids.estudiante } });
    const sesion = await postJson('/auth/login', { correo: activa.correo, contrasena: CONTRASENA });
    expect(sesion.status).toBe(201);
    const refresh = /refresh_token=([^;]+)/.exec(sesion.headers.getSetCookie().join(';'))?.[1];
    expect(refresh).toBeTruthy();
    await prisma.usuario.update({ where: { idUsuario: ids.estudiante }, data: { estado: 'PENDIENTE_VERIFICACION' } });
    try {
      const res = await fetch(`${url}/auth/refresh`, { method: 'POST', headers: { cookie: `refresh_token=${refresh}` } });
      expect(res.status).toBe(401);
      const nuevas = res.headers.getSetCookie().filter((c) => /^(access|refresh)_token=[^;]+/.test(c));
      expect(nuevas).toEqual([]);
    } finally {
      await prisma.usuario.update({ where: { idUsuario: ids.estudiante }, data: { estado: 'ACTIVO' } });
    }

    const forjado = firmar(pendiente);
    expect((await llamar('GET', '/usuarios/me/dashboard', forjado)).status).toBe(401);
    const ws = new WsAuthService(new JwtService({ secret: getJwtSecret() }), prisma as unknown as PrismaService);
    await expect(ws.authenticate({ auth: { token: forjado }, headers: {} })).resolves.toEqual({
      ok: false,
      motivo: 'CUENTA_NO_ACTIVA',
    });
  });

  it('(d) ningun payload de registro ni de perfil puede cambiar roles, estado o administrador', async () => {
    const intrusos = {
      roles: ['administrador'],
      rolesAcceso: ['administrador'],
      rol: 'administrador',
      estado: 'ACTIVO',
      administrador: true,
      esAdmin: true,
      isAdmin: true,
    };
    const antes = await prisma.usuarioRolAcceso.count({ where: { idUsuario: ids.estudiante } });
    for (const [clave, valor] of Object.entries(intrusos)) {
      const perfil = await fetch(`${url}/usuarios/me/perfil`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${tokens.estudiante}`, 'content-type': 'application/json' },
        body: JSON.stringify({ [clave]: valor }),
      });
      expect(perfil.status, `PATCH /usuarios/me/perfil acepto ${clave}`).toBe(400);
      expect(((await perfil.json()) as { message: string[] }).message).toContain(`property ${clave} should not exist`);

      const registro = await postJson('/auth/register', {
        correo: 'x@uvg.edu.gt',
        contrasena: CONTRASENA,
        nombre: 'A',
        apellido: 'B',
        carne: '1',
        idCarrera: 1,
        semestre: 1,
        [clave]: valor,
      });
      expect(registro.status, `POST /auth/register acepto ${clave}`).toBe(400);
      expect(((await registro.json()) as { message: string[] }).message).toContain(`property ${clave} should not exist`);
    }
    expect(await prisma.usuarioRolAcceso.count({ where: { idUsuario: ids.estudiante } })).toBe(antes);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { idUsuario: ids.estudiante } })).estado).toBe('ACTIVO');
  });
});
