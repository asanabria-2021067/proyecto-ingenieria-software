import 'reflect-metadata';
import { afterAll, beforeAll, expect, it } from 'vitest';
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
import { AsociacionMetasAvisosController } from '../../src/associations/asociacion-metas-avisos.controller';
import { AvisosAsociacionService, AVISO_MAX_POR_DIA } from '../../src/associations/avisos-asociacion.service';
import { AnunciosService } from '../../src/anuncios/anuncios.service';
import { AvisoAsociacionDto } from '../../src/associations/dto/aviso-asociacion.dto';
import { DashboardReporteQueryDto } from '../../src/associations/dto/dashboard-query.dto';
import { CrearMetaAsociacionDto, ListarMetasQueryDto, MetaPorcentajeDto } from '../../src/associations/dto/meta-asociacion.dto';
import { JuntaGuard } from '../../src/associations/junta.guard';
import { MetasAsociacionService } from '../../src/associations/metas-asociacion.service';
import { HorasSemestreService } from '../../src/horas-semestre/horas-semestre.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const cookieParser = require('cookie-parser') as () => unknown;

// Semestre ya terminado: el avance esperado es 100 %, asi que en riesgo = avance < 80 % sin depender de la fecha de hoy.
const SEMESTRE = { anio: 2024, periodo: 1 };

function definirParamtypes() {
  const clases: [unknown, unknown[]][] = [
    [AsociacionMetasAvisosController, [MetasAsociacionService, AvisosAsociacionService]],
    [JuntaGuard, [PrismaService]],
    [JwtStrategy, [PrismaService]],
  ];
  for (const [clase, deps] of clases) {
    if (!Reflect.getMetadata(PARAMTYPES_METADATA, clase as object)) Reflect.defineMetadata(PARAMTYPES_METADATA, deps, clase as object);
  }
  const handlers: [string, unknown[]][] = [
    ['listarMetas', [Number, ListarMetasQueryDto]],
    ['crearMeta', [Number, CrearMetaAsociacionDto, Object]],
    ['actualizarMeta', [Number, Number, MetaPorcentajeDto, Object]],
    ['eliminarMeta', [Number, Number, Object]],
    ['contarDestinatarios', [Number, DashboardReporteQueryDto, Object]],
    ['enviarAviso', [Number, AvisoAsociacionDto, Object]],
  ];
  for (const [nombre, tipos] of handlers) {
    Reflect.defineMetadata(PARAMTYPES_METADATA, tipos, AsociacionMetasAvisosController.prototype, nombre);
  }
}

describeIntegration('metas y avisos de la asociacion - permisos y destinatarios (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let url: string;
  const marca = `${Date.now()}`;
  const ids = { carreraA: 0, carreraB: 0, asociacionA: 0, asociacionB: 0, riesgoA: 0, okA: 0, riesgoB: 0, presA: 0, vocalA: 0, editorA: 0, presB: 0, metaB: 0 };
  const tokens: Record<string, string> = {};
  const usuarios: number[] = [];

  const pedir = (ruta: string, quien: string | null, metodo = 'GET', cuerpo?: unknown) =>
    fetch(`${url}${ruta}`, {
      method: metodo,
      headers: { ...(quien ? { cookie: `access_token=${tokens[quien]}` } : {}), ...(cuerpo ? { 'content-type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });

  async function estudiante(nombre: string, idCarrera: number, registro?: { metaBeca?: number; becaDeclarada?: number }) {
    const u = await createIntegrationUser(prisma, { nombre, apellido: `Aviso ${marca}` });
    usuarios.push(u.idUsuario);
    await prisma.perfilEstudiante.create({ data: { idUsuario: u.idUsuario, carne: `a${marca}${u.idUsuario}`.slice(0, 30), idCarrera, semestre: 4 } });
    if (registro) await prisma.registroHorasSemestre.create({ data: { idUsuario: u.idUsuario, ...SEMESTRE, ...registro } });
    tokens[nombre] = new JwtService({ secret: getJwtSecret() }).sign({ sub: u.idUsuario, correo: u.correo, tipo: 'access' });
    return u.idUsuario;
  }

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
    definirParamtypes();
    const db = prisma as unknown as PrismaService;
    const horas = new HorasSemestreService(db);
    const notifications = new NotificationsService(db, { server: undefined } as never);

    @Module({
      imports: [PassportModule],
      controllers: [AsociacionMetasAvisosController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        JwtStrategy,
        JuntaGuard,
        { provide: MetasAsociacionService, useFactory: () => new MetasAsociacionService(db, horas) },
        { provide: AvisosAsociacionService, useFactory: () => new AvisosAsociacionService(db, horas, notifications) },
      ],
    })
    class HarnessModule {}

    app = await NestFactory.create(HarnessModule, { logger: false });
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`;

    ids.carreraA = (await prisma.carrera.create({ data: { nombreCarrera: `Aviso A ${marca}` } })).idCarrera;
    ids.carreraB = (await prisma.carrera.create({ data: { nombreCarrera: `Aviso B ${marca}` } })).idCarrera;
    ids.asociacionA = (await prisma.asociacion.create({ data: { nombre: `Aviso Aso A ${marca}`, carreras: { create: [{ idCarrera: ids.carreraA }] } } })).idAsociacion;
    ids.asociacionB = (await prisma.asociacion.create({ data: { nombre: `Aviso Aso B ${marca}`, carreras: { create: [{ idCarrera: ids.carreraB }] } } })).idAsociacion;

    ids.presA = await estudiante('presA', ids.carreraA);
    ids.vocalA = await estudiante('vocalA', ids.carreraA);
    ids.editorA = await estudiante('editorA', ids.carreraA);
    ids.presB = await estudiante('presB', ids.carreraB);
    await prisma.juntaAsociacion.createMany({
      data: [
        { idAsociacion: ids.asociacionA, idUsuario: ids.presA, cargo: 'PRESIDENTE', nivelPermiso: 'ADMINISTRADOR' },
        { idAsociacion: ids.asociacionA, idUsuario: ids.vocalA, cargo: 'VOCAL', nivelPermiso: 'LECTURA' },
        { idAsociacion: ids.asociacionA, idUsuario: ids.editorA, cargo: 'TESORERO', nivelPermiso: 'EDITOR' },
        { idAsociacion: ids.asociacionB, idUsuario: ids.presB, cargo: 'PRESIDENTE', nivelPermiso: 'ADMINISTRADOR' },
      ],
    });

    ids.riesgoA = await estudiante('riesgoA', ids.carreraA, { metaBeca: 100, becaDeclarada: 10 });
    ids.okA = await estudiante('okA', ids.carreraA, { metaBeca: 100, becaDeclarada: 95 });
    ids.riesgoB = await estudiante('riesgoB', ids.carreraB, { metaBeca: 100, becaDeclarada: 0 });
    ids.metaB = (await prisma.metaAsociacion.create({ data: { idAsociacion: ids.asociacionB, ...SEMESTRE, tipo: 'BECA', porcentajeObjetivo: 60 } })).idMeta;
  }, 60_000);

  afterAll(async () => {
    try {
      await prisma.bitacoraAuditoria.deleteMany({ where: { accion: 'ASOCIACION_AVISO_ENVIADO', idObjeto: { in: [String(ids.asociacionA), String(ids.asociacionB)] } } });
      await prisma.notificacion.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.anuncio.deleteMany({ where: { idAsociacion: { in: [ids.asociacionA, ids.asociacionB] } } });
      await prisma.metaAsociacion.deleteMany({ where: { idAsociacion: { in: [ids.asociacionA, ids.asociacionB] } } });
      await prisma.juntaAsociacion.deleteMany({ where: { idAsociacion: { in: [ids.asociacionA, ids.asociacionB] } } });
      await prisma.asociacion.deleteMany({ where: { nombre: { endsWith: marca } } });
      await prisma.registroHorasSemestre.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.perfilEstudiante.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.usuario.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.carrera.deleteMany({ where: { idCarrera: { in: [ids.carreraA, ids.carreraB] } } });
    } finally {
      await app?.close();
      await prisma.$disconnect();
    }
  }, 60_000);

  const aviso = (quien: string, extra: object = {}, id = ids.asociacionA) =>
    pedir(`/asociaciones/${id}/avisos`, quien, 'POST', { mensaje: 'Registren sus horas', filtros: { ...SEMESTRE, enRiesgo: true, tipo: 'BECA' }, cantidadEsperada: 1, ...extra });

  it('sin sesion 401; sin ser de la junta 403 en metas y avisos', async () => {
    const rutas: [string, string][] = [
      ['GET', `/asociaciones/${ids.asociacionA}/metas`],
      ['GET', `/asociaciones/${ids.asociacionA}/avisos/destinatarios`],
    ];
    for (const [metodo, ruta] of rutas) {
      expect((await pedir(ruta, null, metodo)).status).toBe(401);
      expect((await pedir(ruta, 'riesgoA', metodo)).status).toBe(403);
      expect((await pedir(ruta, 'presB', metodo)).status).toBe(403);
    }
    expect((await aviso('riesgoA')).status).toBe(403);
    expect((await aviso('presB')).status).toBe(403);
  });

  it('un Vocal de solo lectura ve las metas pero recibe 403 al escribir y al avisar', async () => {
    expect((await pedir(`/asociaciones/${ids.asociacionA}/metas`, 'vocalA')).status).toBe(200);
    const meta = { ...SEMESTRE, tipo: 'BECA', porcentajeObjetivo: 80 };
    expect((await pedir(`/asociaciones/${ids.asociacionA}/metas`, 'vocalA', 'POST', meta)).status).toBe(403);
    expect((await pedir(`/asociaciones/${ids.asociacionA}/avisos/destinatarios`, 'vocalA')).status).toBe(403);
    expect((await aviso('vocalA')).status).toBe(403);
    expect(await prisma.anuncio.count({ where: { idAsociacion: ids.asociacionA } })).toBe(0);
  });

  it('metas: el Presidente y un Editor las gestionan; el avance cuenta a los estudiantes al dia de ESA asociacion', async () => {
    const creada = await pedir(`/asociaciones/${ids.asociacionA}/metas`, 'presA', 'POST', { ...SEMESTRE, tipo: 'BECA', porcentajeObjetivo: 50 });
    expect(creada.status).toBe(201);
    const { idMeta } = await creada.json();
    expect((await pedir(`/asociaciones/${ids.asociacionA}/metas`, 'editorA', 'POST', { ...SEMESTRE, tipo: 'BECA', porcentajeObjetivo: 70 })).status).toBe(409);

    const listado = await (await pedir(`/asociaciones/${ids.asociacionA}/metas?anio=${SEMESTRE.anio}&periodo=${SEMESTRE.periodo}`, 'editorA')).json();
    expect(listado.metas).toEqual([
      { idMeta, tipo: 'BECA', porcentajeObjetivo: 50, avance: { alDia: 1, total: 2, porcentaje: 50 }, cumplida: true },
    ]);

    expect((await pedir(`/asociaciones/${ids.asociacionA}/metas/${idMeta}`, 'editorA', 'PATCH', { porcentajeObjetivo: 90 })).status).toBe(200);
    const cambiada = await (await pedir(`/asociaciones/${ids.asociacionA}/metas?anio=${SEMESTRE.anio}&periodo=${SEMESTRE.periodo}`, 'presA')).json();
    expect(cambiada.metas[0]).toMatchObject({ porcentajeObjetivo: 90, cumplida: false });
  });

  it('metas: un id de meta de otra asociacion responde 404 y no se toca', async () => {
    expect((await pedir(`/asociaciones/${ids.asociacionA}/metas/${ids.metaB}`, 'presA', 'PATCH', { porcentajeObjetivo: 10 })).status).toBe(404);
    expect((await pedir(`/asociaciones/${ids.asociacionA}/metas/${ids.metaB}`, 'presA', 'DELETE')).status).toBe(404);
    expect(await prisma.metaAsociacion.findUnique({ where: { idMeta: ids.metaB } })).toMatchObject({ porcentajeObjetivo: 60 });
  });

  it('metas: porcentaje y periodo invalidos se rechazan con 400', async () => {
    const base = `/asociaciones/${ids.asociacionA}/metas`;
    expect((await pedir(base, 'presA', 'POST', { anio: 2025, periodo: 1, tipo: 'BECA', porcentajeObjetivo: 101 })).status).toBe(400);
    expect((await pedir(base, 'presA', 'POST', { anio: 2025, periodo: 3, tipo: 'BECA', porcentajeObjetivo: 50 })).status).toBe(400);
    expect((await pedir(base, 'presA', 'POST', { anio: 2025, periodo: 1, tipo: 'OTRO', porcentajeObjetivo: 50 })).status).toBe(400);
  });

  it('el conteo de destinatarios sale del servidor y solo cuenta estudiantes de la asociacion', async () => {
    const res = await pedir(`/asociaciones/${ids.asociacionA}/avisos/destinatarios?anio=${SEMESTRE.anio}&periodo=${SEMESTRE.periodo}&enRiesgo=true&tipo=BECA`, 'presA');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ cantidad: 1 });
    // intentar apuntar a otra asociacion o a ids concretos: el filtro se rechaza
    expect((await pedir(`/asociaciones/${ids.asociacionA}/avisos/destinatarios?idAsociacion=${ids.asociacionB}`, 'presA')).status).toBe(400);
    expect((await aviso('presA', { filtros: { ...SEMESTRE, idUsuarios: [ids.riesgoB] } })).status).toBe(400);
    expect((await aviso('presA', { idUsuarios: [ids.riesgoB] })).status).toBe(400);
  });

  it('el aviso llega solo a la lista filtrada: notificacion y anuncio dirigido, con bitacora; un cuenta fuera de la lista no lo ve', async () => {
    expect((await aviso('presA', { cantidadEsperada: 7 })).status).toBe(409);

    const res = await aviso('presA');
    expect(res.status).toBe(201);
    const { idAnuncio, destinatarios } = await res.json();
    expect(destinatarios).toBe(1);

    expect(await prisma.anuncioDestinatario.findMany({ where: { idAnuncio } })).toEqual([{ idAnuncio, idUsuario: ids.riesgoA }]);
    const notif = await prisma.notificacion.findMany({ where: { tipoNotificacion: 'AVISO_ASOCIACION', idUsuario: { in: usuarios } } });
    expect(notif.map((n) => n.idUsuario)).toEqual([ids.riesgoA]);
    expect(notif[0].mensajeNotificacion).toBe('Registren sus horas');
    const bitacora = await prisma.bitacoraAuditoria.findFirst({ where: { accion: 'ASOCIACION_AVISO_ENVIADO', idObjeto: String(ids.asociacionA) } });
    expect(bitacora).toMatchObject({ idUsuario: ids.presA, tipoObjeto: 'ASOCIACION' });
    expect(bitacora?.detalleJson).toMatchObject({ idAnuncio, destinatarios: 1 });

    // el banner: lo ve quien esta en la lista y no su companero de carrera
    const anuncios = new AnunciosService(prisma as unknown as PrismaService);
    expect((await anuncios.findVigentes(ids.riesgoA)).map((a) => a.idAnuncio)).toContain(idAnuncio);
    expect((await anuncios.findVigentes(ids.okA)).map((a) => a.idAnuncio)).not.toContain(idAnuncio);
    expect((await anuncios.findVigentes(ids.riesgoB)).map((a) => a.idAnuncio)).not.toContain(idAnuncio);
  });

  it('un Editor tambien puede avisar y, pasado el limite diario, recibe 429', async () => {
    const enviados = await prisma.bitacoraAuditoria.count({ where: { accion: 'ASOCIACION_AVISO_ENVIADO', idObjeto: String(ids.asociacionA) } });
    for (let i = enviados; i < AVISO_MAX_POR_DIA; i += 1) expect((await aviso('editorA')).status).toBe(201);
    expect((await aviso('presA')).status).toBe(429);
    expect(await prisma.bitacoraAuditoria.count({ where: { accion: 'ASOCIACION_AVISO_ENVIADO', idObjeto: String(ids.asociacionA) } })).toBe(AVISO_MAX_POR_DIA);
  });

  it('el mensaje vacio o de mas de 500 caracteres se rechaza', async () => {
    expect((await aviso('presB', { mensaje: '   ' }, ids.asociacionB)).status).toBe(400);
    expect((await aviso('presB', { mensaje: 'x'.repeat(501) }, ids.asociacionB)).status).toBe(400);
  });
});
