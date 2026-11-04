import 'reflect-metadata';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { PARAMTYPES_METADATA } from '@nestjs/common/constants';
import { NestFactory, Reflector } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import {
  createIntegrationParticipation,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationUser,
} from './setup/fixtures';
import { JwtStrategy } from '../../src/auth/jwt.strategy';
import { AuthService } from '../../src/auth/auth.service';
import { getJwtSecret } from '../../src/config/jwt-secret';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { CuentaController } from '../../src/cuenta/cuenta.controller';
import { SolicitudesDesactivacionAdminController } from '../../src/cuenta/solicitudes-desactivacion-admin.controller';
import { SesionesService } from '../../src/cuenta/sesiones.service';
import { MisDatosService } from '../../src/cuenta/mis-datos.service';
import { DesactivacionService } from '../../src/cuenta/desactivacion.service';
import { CambiarContrasenaDto } from '../../src/cuenta/dto/cambiar-contrasena.dto';
import { SolicitarDesactivacionDto, ResolverDesactivacionDto } from '../../src/cuenta/dto/desactivacion.dto';
import type { NotificationsGateway } from '../../src/notifications/notifications.gateway';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { SecurityEventsService } from '../../src/security-events/security-events.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const cookieParser = require('cookie-parser') as () => unknown;

const hash = (t: string) => createHash('sha256').update(t).digest('hex');

function definirParamtypes() {
  const tabla: [unknown, unknown[]][] = [
    [CuentaController, [SesionesService, MisDatosService, DesactivacionService, AuthService]],
    [SolicitudesDesactivacionAdminController, [DesactivacionService]],
    [JwtStrategy, [PrismaService]],
    [RolesGuard, [Reflector, PrismaService]],
  ];
  for (const [clase, deps] of tabla) {
    if (!Reflect.getMetadata(PARAMTYPES_METADATA, clase as object)) {
      Reflect.defineMetadata(PARAMTYPES_METADATA, deps, clase as object);
    }
  }
  const metodos: [object, string, unknown[]][] = [
    [CuentaController.prototype, 'cambiarContrasena', [Object, CambiarContrasenaDto, Object, Object]],
    [CuentaController.prototype, 'solicitarDesactivacion', [Object, SolicitarDesactivacionDto]],
    [SolicitudesDesactivacionAdminController.prototype, 'aprobar', [Object, Number, ResolverDesactivacionDto, Object]],
    [SolicitudesDesactivacionAdminController.prototype, 'rechazar', [Object, Number, ResolverDesactivacionDto]],
  ];
  for (const [proto, nombre, tipos] of metodos) {
    if (!Reflect.getMetadata(PARAMTYPES_METADATA, proto, nombre)) {
      Reflect.defineMetadata(PARAMTYPES_METADATA, tipos, proto, nombre);
    }
  }
}

describeIntegration('cuenta, sesiones y desactivacion: permisos HTTP (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let url: string;
  const jwt = new JwtService({ secret: getJwtSecret() });
  const ids = { a: 0, b: 0, admin: 0, coordinador: 0, c: 0 };
  let auth: AuthService;
  const roles: number[] = [];
  const vinculos: number[] = [];
  const rolesCreados: number[] = [];
  let proyecto = 0;
  let rolProyecto = 0;
  const contrasenaA = 'clave-actual-123';
  const sesA = randomUUID();
  const sesB = randomUUID();
  const refreshA = `refresh-a-${randomUUID()}`;
  const refreshB = `refresh-b-${randomUUID()}`;

  const acceso = (idUsuario: number, correo: string, sv = 0) => jwt.sign({ sub: idUsuario, correo, tipo: 'access', sv });
  const tokens: Record<string, string> = {};
  const llamar = (metodo: string, ruta: string, quien: string, body?: unknown, cookies = '') =>
    fetch(`${url}${ruta}`, {
      method: metodo,
      headers: {
        'content-type': 'application/json',
        cookie: `access_token=${tokens[quien]}${cookies}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  beforeAll(async () => {
    process.env.JWT_REFRESH_SECRET ??= 'integration-refresh-secret';
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
    definirParamtypes();
    const notifications = new NotificationsService(
      prisma as unknown as PrismaService,
      { notifyUsers: vi.fn().mockResolvedValue(undefined), emitToUsers: vi.fn() } as unknown as NotificationsGateway,
    );
    const eventos = new SecurityEventsService(prisma as unknown as PrismaService);
    const emitter = new EventEmitter2();
    auth = new AuthService(
      prisma as unknown as PrismaService,
      jwt,
      notifications,
      undefined,
      undefined,
      eventos,
      emitter,
    );

    @Module({
      imports: [PassportModule],
      controllers: [CuentaController, SolicitudesDesactivacionAdminController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        JwtStrategy,
        RolesGuard,
        { provide: AuthService, useValue: auth },
        { provide: SesionesService, useValue: new SesionesService(prisma as unknown as PrismaService, eventos) },
        { provide: MisDatosService, useValue: new MisDatosService(prisma as unknown as PrismaService) },
        {
          provide: DesactivacionService,
          useValue: new DesactivacionService(prisma as unknown as PrismaService, notifications, eventos, emitter),
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

    const a = await createIntegrationUser(prisma, { nombre: 'Ana', apellido: 'Cuenta', contrasena: await bcrypt.hash(contrasenaA, 4) });
    const b = await createIntegrationUser(prisma, { nombre: 'Beto', apellido: 'Cuenta' });
    const admin = await createIntegrationUser(prisma, { nombre: 'Admin', apellido: 'Cuenta' });
    const coordinador = await createIntegrationUser(prisma, { nombre: 'Coord', apellido: 'Cuenta' });
    Object.assign(ids, { a: a.idUsuario, b: b.idUsuario, admin: admin.idUsuario, coordinador: coordinador.idUsuario });
    for (const [nombrePerfil, idUsuario] of [
      ['administrador', admin.idUsuario],
      ['coordinador', coordinador.idUsuario],
    ] as const) {
      const existente = await prisma.rolAcceso.findUnique({ where: { nombrePerfil } });
      const rol = existente ?? (await prisma.rolAcceso.create({ data: { nombrePerfil } }));
      if (!existente) rolesCreados.push(rol.idRolAcceso);
      roles.push(rol.idRolAcceso);
      const vinculo = await prisma.usuarioRolAcceso.create({ data: { idUsuario, idRolAcceso: rol.idRolAcceso } });
      vinculos.push(vinculo.idUsuarioRolAcceso);
    }
    tokens.a = acceso(a.idUsuario, a.correo);
    tokens.b = acceso(b.idUsuario, b.correo);
    tokens.admin = acceso(admin.idUsuario, admin.correo);
    tokens.coordinador = acceso(coordinador.idUsuario, coordinador.correo);

    const expiraEn = new Date(Date.now() + 3_600_000);
    await prisma.tokenRefresco.createMany({
      data: [
        { idUsuario: a.idUsuario, tokenHash: hash(refreshA), expiraEn, idSesion: sesA, navegador: 'Chrome', sistema: 'Windows' },
        { idUsuario: a.idUsuario, tokenHash: hash(`${refreshA}-otra`), expiraEn, idSesion: randomUUID(), navegador: 'Firefox', sistema: 'Linux' },
        { idUsuario: b.idUsuario, tokenHash: hash(refreshB), expiraEn, idSesion: sesB, navegador: 'Safari', sistema: 'iOS' },
      ],
    });

    const proy = await createIntegrationProject(prisma, admin.idUsuario);
    proyecto = proy.idProyecto;
    rolProyecto = (await createIntegrationProjectRole(prisma, proy.idProyecto)).idRolProyecto;
    await createIntegrationParticipation(prisma, a.idUsuario, rolProyecto);
    await prisma.registroHorasSemestre.create({ data: { idUsuario: a.idUsuario, anio: 2026, periodo: 2, becaDeclarada: 12 } });
  }, 60_000);

  afterAll(async () => {
    try {
      const usuarios = [ids.a, ids.b, ids.admin, ids.coordinador, ids.c].filter((id) => id > 0);
      await prisma.notificacion.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.bitacoraAuditoria.deleteMany({ where: { idUsuario: { in: usuarios }, tipoObjeto: 'SEGURIDAD_CUENTA' } });
      await prisma.solicitudDesactivacion.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.registroHorasSemestre.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.participacionProyecto.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.rolProyecto.deleteMany({ where: { idProyecto: proyecto } });
      await prisma.proyecto.deleteMany({ where: { idProyecto: proyecto } });
      await prisma.usuarioRolAcceso.deleteMany({ where: { idUsuarioRolAcceso: { in: vinculos } } });
      await prisma.usuario.deleteMany({ where: { idUsuario: { in: usuarios } } });
      if (rolesCreados.length) await prisma.rolAcceso.deleteMany({ where: { idRolAcceso: { in: rolesCreados } } });
    } finally {
      await app?.close();
      await prisma.$disconnect();
    }
  }, 60_000);

  const viva = (idSesion: string) => prisma.tokenRefresco.count({ where: { idSesion, revocadoEn: null } });

  it('sin sesion ninguna ruta de cuenta responde 401', async () => {
    for (const [metodo, ruta] of [
      ['GET', '/cuenta/sesiones'],
      ['POST', '/cuenta/sesiones/cerrar-otras'],
      ['GET', '/cuenta/mis-datos'],
      ['GET', '/cuenta/desactivacion'],
      ['GET', '/admin/solicitudes-desactivacion'],
    ]) {
      const res = await fetch(`${url}${ruta}`, { method: metodo });
      expect(res.status, `${metodo} ${ruta}`).toBe(401);
    }
  });

  it('listar sesiones devuelve solo las propias, marca la actual y no expone token ni hash', async () => {
    const res = await llamar('GET', '/cuenta/sesiones', 'a', undefined, `; refresh_token=${refreshA}`);

    expect(res.status).toBe(200);
    const lista = (await res.json()) as Array<Record<string, unknown>>;
    expect(lista).toHaveLength(2);
    expect(lista.find((s) => s.idSesion === sesA)).toMatchObject({ navegador: 'Chrome', sistema: 'Windows', actual: true });
    expect(lista.some((s) => s.idSesion === sesB)).toBe(false);
    const texto = JSON.stringify(lista);
    expect(texto).not.toContain(hash(refreshA));
    expect(texto).not.toContain('tokenHash');
  });

  it('otro usuario no puede cerrar ni reportar mis sesiones (404) y la sesion sigue viva', async () => {
    const cerrar = await llamar('DELETE', `/cuenta/sesiones/${sesB}`, 'a');
    const noFuiYo = await llamar('POST', `/cuenta/sesiones/${sesB}/no-fui-yo`, 'a');

    expect(cerrar.status).toBe(404);
    expect(noFuiYo.status).toBe(404);
    expect(await viva(sesB)).toBe(1);
  });

  it('cerrar-otras cierra las demas de la cuenta y no toca las de otra persona', async () => {
    const res = await llamar('POST', '/cuenta/sesiones/cerrar-otras', 'a', undefined, `; refresh_token=${refreshA}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cerradas: 1 });
    expect(await viva(sesA)).toBe(1);
    expect(await viva(sesB)).toBe(1);
  });

  it('descargar mis datos entrega solo lo propio, como archivo y sin hashes ni tokens', async () => {
    const res = await llamar('GET', '/cuenta/mis-datos', 'a');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('attachment');
    const texto = await res.text();
    const datos = JSON.parse(texto);
    expect(datos.idUsuario).toBe(ids.a);
    expect(datos.participaciones).toHaveLength(1);
    expect(datos.registrosHorasSemestre[0]).toMatchObject({ becaDeclarada: 12 });
    expect(texto).not.toContain('contrasena');
    expect(texto).not.toContain('tokenHash');
    expect(texto).not.toContain(hash(refreshA));
    const b = await prisma.usuario.findUniqueOrThrow({ where: { idUsuario: ids.b } });
    expect(texto).not.toContain(b.correo);
  });

  it('cambiar la contrasena exige la actual (400) y no cierra nada si es incorrecta', async () => {
    const res = await llamar('POST', '/cuenta/contrasena', 'a', { contrasenaActual: 'incorrecta', nuevaContrasena: 'nueva-clave-456' });

    expect(res.status).toBe(400);
    expect(await viva(sesA)).toBe(1);
  });

  it('cambiar la contrasena con la actual correcta cierra las demas sesiones y deja valida la actual con tokens nuevos', async () => {
    const otraSesion = randomUUID();
    await prisma.tokenRefresco.create({
      data: { idUsuario: ids.a, tokenHash: hash(randomUUID()), expiraEn: new Date(Date.now() + 3_600_000), idSesion: otraSesion },
    });
    const viejo = tokens.a;

    const res = await llamar('POST', '/cuenta/contrasena', 'a', { contrasenaActual: contrasenaA, nuevaContrasena: 'nueva-clave-456' }, `; refresh_token=${refreshA}`);

    expect(res.status).toBe(200);
    const cookies = res.headers.getSetCookie();
    const nuevoAcceso = cookies.find((c) => c.startsWith('access_token='))?.split(';')[0].split('=')[1];
    expect(nuevoAcceso).toBeTruthy();
    expect(cookies.some((c) => c.startsWith('refresh_token='))).toBe(true);
    expect(await viva(otraSesion)).toBe(0);
    expect(await viva(sesA)).toBe(1);
    expect(await bcrypt.compare('nueva-clave-456', (await prisma.usuario.findUniqueOrThrow({ where: { idUsuario: ids.a } })).contrasena)).toBe(true);
    expect((await llamar('GET', '/cuenta/sesiones', 'a')).status).toBe(401);
    expect(viejo).not.toBe(nuevoAcceso);
    tokens.a = nuevoAcceso as string;
    expect((await llamar('GET', '/cuenta/sesiones', 'a')).status).toBe(200);
  });

  it('no se puede pedir la desactivacion de otra cuenta: el cuerpo con otro usuario se rechaza', async () => {
    const res = await llamar('POST', '/cuenta/desactivacion', 'a', { idUsuario: ids.b, motivo: 'x' });

    expect(res.status).toBe(400);
    expect(await prisma.solicitudDesactivacion.count({ where: { idUsuario: ids.b } })).toBe(0);
  });

  it('un usuario no puede tener dos solicitudes pendientes (409) y nadie mas la ve', async () => {
    const primera = await llamar('POST', '/cuenta/desactivacion', 'a', { motivo: 'Me voy del programa' });
    const segunda = await llamar('POST', '/cuenta/desactivacion', 'a', {});

    expect(primera.status).toBe(201);
    expect(segunda.status).toBe(409);
    expect(await prisma.solicitudDesactivacion.count({ where: { idUsuario: ids.a, estado: 'PENDIENTE' } })).toBe(1);
    const deB = await llamar('GET', '/cuenta/desactivacion', 'b');
    expect(await deB.json()).toEqual({ solicitud: null });
    const avisos = await prisma.notificacion.count({ where: { idUsuario: ids.admin, tipoNotificacion: 'SOLICITUD_DESACTIVACION' } });
    expect(avisos).toBe(1);
  });

  it('un administrador no puede solicitar su propia desactivacion', async () => {
    const res = await llamar('POST', '/cuenta/desactivacion', 'admin', {});

    expect(res.status).toBe(403);
  });

  it('el estudiante, otro estudiante y el coordinador no pueden ver ni resolver solicitudes (403)', async () => {
    const solicitud = await prisma.solicitudDesactivacion.findFirstOrThrow({ where: { idUsuario: ids.a } });
    for (const quien of ['a', 'b', 'coordinador']) {
      expect((await llamar('GET', '/admin/solicitudes-desactivacion', quien)).status, quien).toBe(403);
      expect((await llamar('POST', `/admin/solicitudes-desactivacion/${solicitud.idSolicitud}/aprobar`, quien, {})).status, quien).toBe(403);
      expect((await llamar('POST', `/admin/solicitudes-desactivacion/${solicitud.idSolicitud}/rechazar`, quien, {})).status, quien).toBe(403);
    }
    const intacta = await prisma.solicitudDesactivacion.findUniqueOrThrow({ where: { idSolicitud: solicitud.idSolicitud } });
    expect(intacta.estado).toBe('PENDIENTE');
    expect((await prisma.usuario.findUniqueOrThrow({ where: { idUsuario: ids.a } })).estado).toBe('ACTIVO');
  });

  it('el administrador ve la solicitud en su bandeja y puede rechazarla; el usuario recibe el aviso', async () => {
    const solicitud = await prisma.solicitudDesactivacion.findFirstOrThrow({ where: { idUsuario: ids.a } });

    const lista = await llamar('GET', '/admin/solicitudes-desactivacion', 'admin');
    expect(lista.status).toBe(200);
    expect(((await lista.json()) as Array<{ idSolicitud: number }>).map((s) => s.idSolicitud)).toContain(solicitud.idSolicitud);

    const res = await llamar('POST', `/admin/solicitudes-desactivacion/${solicitud.idSolicitud}/rechazar`, 'admin', { comentario: 'Hablemos primero' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ estado: 'RECHAZADA', comentarioResolucion: 'Hablemos primero' });
    expect((await prisma.usuario.findUniqueOrThrow({ where: { idUsuario: ids.a } })).estado).toBe('ACTIVO');
    expect(await prisma.notificacion.count({ where: { idUsuario: ids.a, tipoNotificacion: 'DESACTIVACION_RESUELTA' } })).toBe(1);
  });

  it('aprobar desactiva la cuenta, cierra sesiones y conserva horas y participaciones', async () => {
    await llamar('POST', '/cuenta/desactivacion', 'a', { motivo: 'Segunda vez' });
    const solicitud = await prisma.solicitudDesactivacion.findFirstOrThrow({ where: { idUsuario: ids.a, estado: 'PENDIENTE' } });

    const res = await llamar('POST', `/admin/solicitudes-desactivacion/${solicitud.idSolicitud}/aprobar`, 'admin', {});

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ estado: 'APROBADA' });
    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { idUsuario: ids.a } });
    expect(usuario.estado).toBe('INACTIVO');
    expect(usuario.sesionVersion).toBeGreaterThan(0);
    expect(await prisma.tokenRefresco.count({ where: { idUsuario: ids.a, revocadoEn: null } })).toBe(0);
    expect(await prisma.participacionProyecto.count({ where: { idUsuario: ids.a } })).toBe(1);
    expect(await prisma.registroHorasSemestre.count({ where: { idUsuario: ids.a } })).toBe(1);
    expect(await prisma.notificacion.count({ where: { idUsuario: ids.a, tipoNotificacion: 'DESACTIVACION_RESUELTA' } })).toBe(2);
    const otraVez = await llamar('POST', `/admin/solicitudes-desactivacion/${solicitud.idSolicitud}/aprobar`, 'admin', {});
    expect(otraVez.status).toBe(409);
  });

  it('login: el primer navegador no avisa, el mismo no vuelve a avisar y uno nuevo avisa con enlace a su sesion', async () => {
    const c = await createIntegrationUser(prisma, { nombre: 'Carla', apellido: 'Cuenta', contrasena: await bcrypt.hash('clave-carla-123', 4) });
    ids.c = c.idUsuario;
    const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
    const iniciar = (idDispositivo: string, userAgent = chrome) =>
      auth.login({ correo: c.correo, contrasena: 'clave-carla-123' }, undefined, { userAgent, idDispositivo });
    const avisos = () => prisma.notificacion.findMany({ where: { idUsuario: c.idUsuario, tipoNotificacion: 'NUEVO_INICIO_SESION' } });

    await iniciar('dispositivo-1');
    await iniciar('dispositivo-1');
    expect(await avisos()).toHaveLength(0);
    expect(await prisma.dispositivoUsuario.count({ where: { idUsuario: c.idUsuario } })).toBe(1);

    await iniciar('dispositivo-2');
    const [aviso] = await avisos();
    expect(aviso.datosJson).toMatchObject({ navegador: 'Chrome', sistema: 'Windows' });
    const idSesion = (aviso.datosJson as { idSesion: string }).idSesion;
    expect(await prisma.tokenRefresco.count({ where: { idUsuario: c.idUsuario, idSesion, revocadoEn: null } })).toBe(1);

    const tokenC = acceso(c.idUsuario, c.correo);
    tokens.c = tokenC;
    const res = await llamar('POST', `/cuenta/sesiones/${idSesion}/no-fui-yo`, 'c');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ cerrada: true, cambiarContrasena: true });
    expect(await prisma.tokenRefresco.count({ where: { idUsuario: c.idUsuario, idSesion, revocadoEn: null } })).toBe(0);
    expect(await prisma.dispositivoUsuario.count({ where: { idUsuario: c.idUsuario } })).toBe(1);
    expect((await avisos())[0].leidaEn).not.toBeNull();
  });

  it('un cierre deliberado no cuenta como reuso: refrescar con su token da 401 sin tumbar las demas; el reuso real sí', async () => {
    const c = await prisma.usuario.findUniqueOrThrow({ where: { idUsuario: ids.c } });
    const firmar = () =>
      jwt.sign({ sub: c.idUsuario, correo: c.correo, tipo: 'refresh', sv: c.sesionVersion, jti: randomUUID() }, { secret: process.env.JWT_REFRESH_SECRET });
    const futuro = new Date(Date.now() + 3_600_000);
    const hace = new Date(Date.now() - 60_000);
    const [tokenX, tokenY, tokenZ] = [firmar(), firmar(), firmar()];
    const [sesX, sesY, sesZ] = [randomUUID(), randomUUID(), randomUUID()];
    await prisma.tokenRefresco.createMany({
      data: [
        { idUsuario: c.idUsuario, tokenHash: hash(tokenX), expiraEn: futuro, idSesion: sesX },
        { idUsuario: c.idUsuario, tokenHash: hash(tokenY), expiraEn: futuro, idSesion: sesY },
        // Token ya rotado hace un minuto: su reuso sí es sospechoso.
        { idUsuario: c.idUsuario, tokenHash: hash(tokenZ), expiraEn: futuro, idSesion: sesZ, revocadoEn: hace },
      ],
    });

    expect((await llamar('DELETE', `/cuenta/sesiones/${sesX}`, 'c')).status).toBe(200);
    // Pasados los 10 s de gracia desde el cierre.
    await prisma.tokenRefresco.updateMany({ where: { idSesion: sesX }, data: { revocadoEn: hace, expiraEn: hace } });

    await expect(auth.refreshToken(tokenX)).rejects.toMatchObject({ status: 401 });
    expect(await viva(sesY)).toBe(1);

    await expect(auth.refreshToken(tokenZ)).rejects.toMatchObject({ status: 401 });
    expect(await viva(sesY)).toBe(0);
  });

  it('con la cuenta inactiva el token anterior deja de valer (401)', async () => {
    const res = await llamar('GET', '/cuenta/sesiones', 'a');

    expect(res.status).toBe(401);
  });
});
