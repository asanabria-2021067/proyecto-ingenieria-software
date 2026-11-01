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
import { createIntegrationProject, createIntegrationUser } from './setup/fixtures';
import { JwtStrategy } from '../../src/auth/jwt.strategy';
import { getJwtSecret } from '../../src/config/jwt-secret';
import { AssociationDashboardController } from '../../src/associations/association-dashboard.controller';
import { AssociationDashboardService } from '../../src/associations/association-dashboard.service';
import { DashboardEstudiantesQueryDto, DashboardReporteQueryDto } from '../../src/associations/dto/dashboard-query.dto';
import { JuntaGuard } from '../../src/associations/junta.guard';
import { HorasSemestreService } from '../../src/horas-semestre/horas-semestre.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const cookieParser = require('cookie-parser') as () => unknown;

// Semestre ya terminado: el avance esperado es 100 %, asi que en riesgo = avance < 80 % sin depender de la fecha de hoy.
const SEMESTRE = 'anio=2024&periodo=1';

function definirParamtypes() {
  const clases: [unknown, unknown[]][] = [
    [AssociationDashboardController, [AssociationDashboardService]],
    [JuntaGuard, [PrismaService]],
    [JwtStrategy, [PrismaService]],
  ];
  for (const [clase, deps] of clases) {
    if (!Reflect.getMetadata(PARAMTYPES_METADATA, clase as object)) Reflect.defineMetadata(PARAMTYPES_METADATA, deps, clase as object);
  }
  const handlers: [string, unknown[]][] = [
    ['estudiantes', [Number, DashboardEstudiantesQueryDto]],
    ['estudiantesCsv', [Number, DashboardReporteQueryDto, Object]],
    ['estudiantesPdf', [Number, DashboardReporteQueryDto, Object, Object]],
    ['proyectos', [Number]],
    ['proyectosCsv', [Number, Object]],
    ['proyectosPdf', [Number, Object, Object]],
  ];
  for (const [nombre, tipos] of handlers) {
    Reflect.defineMetadata(PARAMTYPES_METADATA, tipos, AssociationDashboardController.prototype, nombre);
  }
}

describeIntegration('dashboard de asociacion - permisos y regla en riesgo (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let url: string;
  const marca = `${Date.now()}`;
  const ids = {
    presA: 0,
    presB: 0,
    ajeno: 0,
    carreraA1: 0,
    carreraA2: 0,
    carreraB: 0,
    asociacionA: 0,
    asociacionB: 0,
    riesgoA1: 0,
    okA2: 0,
    riesgoB: 0,
    sinRegistroA1: 0,
    inactivoA1: 0,
    proyecto: 0,
  };
  const tokens: Record<string, string> = {};
  const usuarios: number[] = [];

  const pedir = (ruta: string, quien: string | null) =>
    fetch(`${url}${ruta}`, { headers: quien ? { cookie: `access_token=${tokens[quien]}` } : {} });

  async function estudiante(nombre: string, idCarrera: number, registro?: { metaBeca?: number; becaDeclarada?: number; metaExtension?: number; extensionDeclarada?: number }, estado: 'ACTIVO' | 'BLOQUEADO' = 'ACTIVO') {
    const u = await createIntegrationUser(prisma, { nombre, apellido: `Dash ${marca}` });
    usuarios.push(u.idUsuario);
    if (estado !== 'ACTIVO') await prisma.usuario.update({ where: { idUsuario: u.idUsuario }, data: { estado } });
    await prisma.perfilEstudiante.create({ data: { idUsuario: u.idUsuario, carne: `d${marca}${u.idUsuario}`.slice(0, 30), idCarrera, semestre: 4 } });
    if (registro) await prisma.registroHorasSemestre.create({ data: { idUsuario: u.idUsuario, anio: 2024, periodo: 1, ...registro } });
    tokens[nombre] = new JwtService({ secret: getJwtSecret() }).sign({ sub: u.idUsuario, correo: u.correo, tipo: 'access' });
    return u.idUsuario;
  }

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
    definirParamtypes();
    const horas = new HorasSemestreService(prisma as unknown as PrismaService);

    @Module({
      imports: [PassportModule],
      controllers: [AssociationDashboardController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        JwtStrategy,
        JuntaGuard,
        { provide: AssociationDashboardService, useFactory: () => new AssociationDashboardService(prisma as unknown as PrismaService, horas) },
      ],
    })
    class HarnessModule {}

    app = await NestFactory.create(HarnessModule, { logger: false });
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`;

    ids.carreraA1 = (await prisma.carrera.create({ data: { nombreCarrera: `Dash A1 ${marca}` } })).idCarrera;
    ids.carreraA2 = (await prisma.carrera.create({ data: { nombreCarrera: `Dash A2 ${marca}` } })).idCarrera;
    ids.carreraB = (await prisma.carrera.create({ data: { nombreCarrera: `Dash B ${marca}` } })).idCarrera;
    ids.asociacionA = (
      await prisma.asociacion.create({
        data: { nombre: `Aso A ${marca}`, carreras: { create: [{ idCarrera: ids.carreraA1 }, { idCarrera: ids.carreraA2 }] } },
      })
    ).idAsociacion;
    ids.asociacionB = (
      await prisma.asociacion.create({ data: { nombre: `Aso B ${marca}`, carreras: { create: [{ idCarrera: ids.carreraB }] } } })
    ).idAsociacion;

    ids.presA = await estudiante('presA', ids.carreraA1);
    ids.presB = await estudiante('presB', ids.carreraB);
    ids.ajeno = await estudiante('ajeno', ids.carreraA1);
    await prisma.juntaAsociacion.create({ data: { idAsociacion: ids.asociacionA, idUsuario: ids.presA, cargo: 'PRESIDENTE', nivelPermiso: 'ADMINISTRADOR' } });
    await prisma.juntaAsociacion.create({ data: { idAsociacion: ids.asociacionB, idUsuario: ids.presB, cargo: 'PRESIDENTE', nivelPermiso: 'ADMINISTRADOR' } });

    ids.riesgoA1 = await estudiante('riesgoA1', ids.carreraA1, { metaBeca: 100, becaDeclarada: 10, metaExtension: 50, extensionDeclarada: 50 });
    ids.okA2 = await estudiante('okA2', ids.carreraA2, { metaBeca: 100, becaDeclarada: 90 });
    ids.riesgoB = await estudiante('riesgoB', ids.carreraB, { metaBeca: 100, becaDeclarada: 0 });
    ids.sinRegistroA1 = await estudiante('sinRegistroA1', ids.carreraA1);
    ids.inactivoA1 = await estudiante('inactivoA1', ids.carreraA1, { metaBeca: 100, becaDeclarada: 0 }, 'BLOQUEADO');

    ids.proyecto = (await createIntegrationProject(prisma, ids.presA, { tituloProyecto: `Proyecto Aso ${marca}`, estadoProyecto: 'EN_PROGRESO' })).idProyecto;
    await prisma.proyecto.update({ where: { idProyecto: ids.proyecto }, data: { idAsociacion: ids.asociacionA } });
    await prisma.tarea.createMany({
      data: [
        { idProyecto: ids.proyecto, creadaPor: ids.presA, tituloTarea: 'Hecha', estadoTarea: 'HECHO' },
        { idProyecto: ids.proyecto, creadaPor: ids.presA, tituloTarea: 'Pendiente', estadoTarea: 'POR_HACER' },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    try {
      await prisma.tarea.deleteMany({ where: { idProyecto: ids.proyecto || -1 } });
      await prisma.proyecto.deleteMany({ where: { idProyecto: ids.proyecto || -1 } });
      await prisma.juntaAsociacion.deleteMany({ where: { idAsociacion: { in: [ids.asociacionA, ids.asociacionB] } } });
      await prisma.asociacion.deleteMany({ where: { nombre: { endsWith: marca } } });
      await prisma.registroHorasSemestre.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.perfilEstudiante.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.usuario.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.carrera.deleteMany({ where: { idCarrera: { in: [ids.carreraA1, ids.carreraA2, ids.carreraB] } } });
    } finally {
      await app?.close();
      await prisma.$disconnect();
    }
  }, 60_000);

  const rutas = (id: number) => [
    `/asociaciones/${id}/estudiantes`,
    `/asociaciones/${id}/estudiantes/csv`,
    `/asociaciones/${id}/estudiantes/pdf`,
    `/asociaciones/${id}/proyectos`,
    `/asociaciones/${id}/proyectos/csv`,
    `/asociaciones/${id}/proyectos/pdf`,
  ];

  it('sin sesion 401; estudiante que no es de la junta 403 en todas las rutas', async () => {
    for (const ruta of rutas(ids.asociacionA)) {
      expect((await pedir(ruta, null)).status).toBe(401);
      expect((await pedir(ruta, 'ajeno')).status).toBe(403);
    }
  });

  it('la junta de otra asociacion recibe 403 en todas las rutas', async () => {
    for (const ruta of rutas(ids.asociacionA)) expect((await pedir(ruta, 'presB')).status).toBe(403);
    for (const ruta of rutas(ids.asociacionB)) expect((await pedir(ruta, 'presA')).status).toBe(403);
  });

  it('la junta ve solo estudiantes activos de las carreras de su asociacion', async () => {
    const res = await pedir(`/asociaciones/${ids.asociacionA}/estudiantes?${SEMESTRE}&limit=100`, 'presA');
    expect(res.status).toBe(200);
    const { filas } = await res.json();
    const vistos = filas.map((f: { idUsuario: number }) => f.idUsuario);
    expect(vistos).toEqual(expect.arrayContaining([ids.riesgoA1, ids.okA2, ids.sinRegistroA1, ids.presA, ids.ajeno]));
    expect(vistos).not.toContain(ids.riesgoB);
    expect(vistos).not.toContain(ids.presB);
    expect(vistos).not.toContain(ids.inactivoA1);

    const otra = await (await pedir(`/asociaciones/${ids.asociacionB}/estudiantes?${SEMESTRE}&limit=100`, 'presB')).json();
    const deB = otra.filas.map((f: { idUsuario: number }) => f.idUsuario);
    expect(deB).toContain(ids.riesgoB);
    expect(deB).not.toContain(ids.riesgoA1);
  });

  it('pedir una carrera ajena por parametro no abre datos: se rechaza el filtro', async () => {
    const res = await pedir(`/asociaciones/${ids.asociacionA}/estudiantes?idCarrera=${ids.carreraB}&idAsociacion=${ids.asociacionB}`, 'presA');
    expect(res.status).toBe(400);
  });

  it('cada fila trae solo nombre, carne, carrera, horas y proyectos: sin telefono ni contacto', async () => {
    const { filas } = await (await pedir(`/asociaciones/${ids.asociacionA}/estudiantes?${SEMESTRE}&limit=100`, 'presA')).json();
    const fila = filas.find((f: { idUsuario: number }) => f.idUsuario === ids.riesgoA1);
    expect(Object.keys(fila).sort()).toEqual(
      [
        'apellido', 'becaAcreditada', 'becaDeclarada', 'carne', 'carrera', 'enRiesgo', 'extensionAcreditada', 'extensionDeclarada',
        'faltaBeca', 'faltaExtension', 'idCarrera', 'idUsuario', 'metaBeca', 'metaExtension', 'nombre', 'proyectosActivos',
      ].sort(),
    );
    expect(fila).toMatchObject({ metaBeca: 100, becaDeclarada: 10, becaAcreditada: 0, faltaBeca: 90, proyectosActivos: 0 });
  });

  it('en riesgo: avance < esperado - 20 puntos (reusa esEnRiesgo de HRS)', async () => {
    const { filas } = await (await pedir(`/asociaciones/${ids.asociacionA}/estudiantes?${SEMESTRE}&limit=100`, 'presA')).json();
    const riesgo = (id: number) => filas.find((f: { idUsuario: number }) => f.idUsuario === id).enRiesgo;
    expect(riesgo(ids.riesgoA1)).toBe(true);
    expect(riesgo(ids.okA2)).toBe(false);
    expect(riesgo(ids.sinRegistroA1)).toBe(false);

    const soloRiesgo = await (await pedir(`/asociaciones/${ids.asociacionA}/estudiantes?${SEMESTRE}&enRiesgo=true&limit=100`, 'presA')).json();
    expect(soloRiesgo.filas.map((f: { idUsuario: number }) => f.idUsuario)).toEqual([ids.riesgoA1]);

    // extension 50/50 cumplida: filtrando por ese tipo ya no esta en riesgo
    const ext = await (await pedir(`/asociaciones/${ids.asociacionA}/estudiantes?${SEMESTRE}&enRiesgo=true&tipo=EXTENSION&limit=100`, 'presA')).json();
    expect(ext.filas).toEqual([]);
  });

  it('busqueda por nombre o carne y carga incremental con cursor', async () => {
    const porNombre = await (await pedir(`/asociaciones/${ids.asociacionA}/estudiantes?${SEMESTRE}&busqueda=okA2`, 'presA')).json();
    expect(porNombre.filas.map((f: { idUsuario: number }) => f.idUsuario)).toEqual([ids.okA2]);

    const p1 = await (await pedir(`/asociaciones/${ids.asociacionA}/estudiantes?${SEMESTRE}&limit=2`, 'presA')).json();
    expect(p1.filas).toHaveLength(2);
    expect(p1.siguienteCursor).not.toBeNull();
    const p2 = await (await pedir(`/asociaciones/${ids.asociacionA}/estudiantes?${SEMESTRE}&limit=100&cursor=${p1.siguienteCursor}`, 'presA')).json();
    expect(p2.filas.every((f: { idUsuario: number }) => f.idUsuario > p1.siguienteCursor)).toBe(true);
  });

  it('reportes CSV y PDF respetan los filtros activos', async () => {
    const csv = await pedir(`/asociaciones/${ids.asociacionA}/estudiantes/csv?${SEMESTRE}&enRiesgo=true`, 'presA');
    expect(csv.status).toBe(200);
    expect(csv.headers.get('content-type')).toContain('text/csv');
    const texto = await csv.text();
    expect(texto).toContain(`riesgoA1 Dash ${marca}`);
    expect(texto).not.toContain(`okA2 Dash ${marca}`);
    expect(texto).not.toContain(`riesgoB Dash ${marca}`);

    const pdf = await pedir(`/asociaciones/${ids.asociacionA}/estudiantes/pdf?${SEMESTRE}&enRiesgo=true`, 'presA');
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get('content-type')).toContain('application/pdf');
    expect((await pdf.text()).startsWith('%PDF')).toBe(true);
  });

  it('proyectos de la asociacion con avance; reportes CSV y PDF', async () => {
    const res = await pedir(`/asociaciones/${ids.asociacionA}/proyectos`, 'presA');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      expect.objectContaining({ idProyecto: ids.proyecto, estado: 'EN_PROGRESO', avanceTareasPct: 50, avanceSprintsPct: 0 }),
    ]);
    expect(await (await pedir(`/asociaciones/${ids.asociacionB}/proyectos`, 'presB')).json()).toEqual([]);

    const csv = await (await pedir(`/asociaciones/${ids.asociacionA}/proyectos/csv`, 'presA')).text();
    expect(csv).toContain(`Proyecto Aso ${marca}`);
    const pdf = await pedir(`/asociaciones/${ids.asociacionA}/proyectos/pdf`, 'presA');
    expect(pdf.status).toBe(200);
    expect((await pdf.text()).startsWith('%PDF')).toBe(true);
  });
});
