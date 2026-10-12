import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GUARDS_METADATA, METHOD_METADATA, MODULE_METADATA, PARAMTYPES_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PrismaClient } from '@prisma/client';
vi.hoisted(() => {
  process.env.FRONTEND_URL ??= 'http://localhost:3000';
});
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { ROLES_METADATA_KEY } from '../src/common/decorators/roles.decorator';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { ProjectPolicyModule } from '../src/common/project-policy/project-policy.module';
import { ProjectPolicyService } from '../src/common/project-policy/project-policy.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ListSecurityEventsQueryDto } from '../src/security-events/dto/list-security-events-query.dto';
import { SecurityEventsController } from '../src/security-events/security-events.controller';
import { SecurityEventsModule } from '../src/security-events/security-events.module';
import { SecurityEventsQueryService } from '../src/security-events/security-events-query.service';
import { SecurityEventsService } from '../src/security-events/security-events.service';
import { accessTokenFor, requestJson, startIntegrationHttpHarness, type IntegrationHttpHarness } from './integration/setup/http-harness';

/**
 * FG01-C05 (T-310). `GET /api/admin/eventos-seguridad` servido por HTTP real
 * (NestFactory, prefijo, ValidationPipe, JwtAuthGuard, JwtStrategy y
 * RolesGuard reales) sobre un doble de Prisma: no necesita base.
 */

const ADMIN = { idUsuario: 7, correo: 'admin@example.test' };
const ESTUDIANTE = { idUsuario: 8, correo: 'estudiante@example.test' };
const DESACTIVADO = { idUsuario: 9, correo: 'baja@example.test' };

const FILA = {
  idAuditoria: 31,
  accion: 'USER_STATUS_CHANGED',
  idUsuario: 7,
  idObjeto: '8',
  detalleJson: { estadoAnterior: 'ACTIVO', estadoNuevo: 'BLOQUEADO', ipTrusted: false, token: 'tok-no-debe-salir' },
  ipOrigen: '203.0.113.9',
  fechaEvento: new Date('2026-10-11T06:00:00.000Z'),
};

function prismaDoble() {
  return {
    usuario: {
      findUnique: vi.fn(({ where }: { where: { idUsuario: number } }) =>
        Promise.resolve(
          where.idUsuario === DESACTIVADO.idUsuario
            ? { estado: 'INACTIVO' }
            : [ADMIN.idUsuario, ESTUDIANTE.idUsuario].includes(where.idUsuario)
              ? { estado: 'ACTIVO' }
              : null,
        ),
      ),
      findMany: vi.fn().mockResolvedValue([
        { idUsuario: 7, nombre: 'Ada', apellido: 'Admin' },
        { idUsuario: 8, nombre: 'Eva', apellido: 'Estudiante' },
      ]),
    },
    usuarioRolAcceso: {
      findFirst: vi.fn(({ where }: { where: { idUsuario: number } }) =>
        Promise.resolve(where.idUsuario === ADMIN.idUsuario ? { idUsuarioRolAcceso: 1 } : null),
      ),
    },
    bitacoraAuditoria: {
      findMany: vi.fn().mockResolvedValue([FILA]),
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn((operaciones: Promise<unknown>[]) => Promise.all(operaciones)),
  };
}

describe('FG01-C05: GET /api/admin/eventos-seguridad', () => {
  const prisma = prismaDoble();
  let http: IntegrationHttpHarness;
  const tokens = { admin: '', estudiante: '', desactivado: '' };
  const pedir = (consulta = '', token?: string) => requestJson(`${http.url}/admin/eventos-seguridad${consulta}`, { token });

  beforeAll(async () => {
    tokens.admin = accessTokenFor(ADMIN);
    tokens.estudiante = accessTokenFor(ESTUDIANTE);
    tokens.desactivado = accessTokenFor(DESACTIVADO);
    // Lo que `emitDecoratorMetadata` genera en el build real.
    Reflect.defineMetadata(PARAMTYPES_METADATA, [Reflector, PrismaService], RolesGuard);
    http = await startIntegrationHttpHarness({
      prisma: prisma as unknown as PrismaClient,
      controllers: [
        {
          controller: SecurityEventsController,
          deps: [SecurityEventsQueryService],
          handlers: { list: [Object, ListSecurityEventsQueryDto] },
        },
      ],
      providers: [
        {
          provide: SecurityEventsQueryService,
          useValue: new SecurityEventsQueryService(prisma as unknown as PrismaService, new ProjectPolicyService({} as never)),
        },
      ],
    });
  });

  afterAll(async () => {
    await http?.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('administrador -> 200 con {data,total,page,totalPages,tipos} y eventos saneados', async () => {
    const { status, body } = await pedir('', tokens.admin);
    expect(status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(['data', 'page', 'tipos', 'total', 'totalPages']);
    expect(body).toMatchObject({ total: 1, page: 1, totalPages: 1 });
    expect(body.tipos).toEqual([
      'LOGIN_FAILED',
      'LOGIN_SUCCEEDED',
      'ACCOUNT_LOCKED',
      'PASSWORD_RESET_ISSUED',
      'PASSWORD_RESET_COMPLETED',
      'USER_STATUS_CHANGED',
    ]);
    expect(body.data).toEqual([
      {
        id: 31,
        tipo: 'USER_STATUS_CHANGED',
        fecha: '2026-10-11T06:00:00.000Z',
        actor: { idUsuario: 7, nombre: 'Ada Admin' },
        cuenta: { idUsuario: 8, nombre: 'Eva Estudiante' },
        origen: { ip: '203.0.113.9', ipConfiable: false },
        detalle: { estadoAnterior: 'ACTIVO', estadoNuevo: 'BLOQUEADO' },
      },
    ]);
    expect(JSON.stringify(body)).not.toContain('tok-no-debe-salir');
    expect(JSON.stringify(body)).not.toContain('detalleJson');
  });

  it('administrador con filtros válidos -> 200 y la consulta llega convertida al servicio', async () => {
    const consulta =
      '?tipo=LOGIN_FAILED&desde=2026-10-01T00:00:00-06:00&hasta=2026-10-11T23:59:59.999-06:00&idUsuario=8&page=2&limit=5';
    const { status, body } = await pedir(consulta.replace(/\+/g, '%2B'), tokens.admin);
    expect(status).toBe(200);
    expect(body.page).toBe(2);
    expect(prisma.bitacoraAuditoria.findMany.mock.calls[0][0]).toMatchObject({
      where: {
        tipoObjeto: 'SEGURIDAD_CUENTA',
        accion: 'LOGIN_FAILED',
        fechaEvento: { gte: new Date('2026-10-01T06:00:00.000Z'), lte: new Date('2026-10-12T05:59:59.999Z') },
        OR: [{ idUsuario: 8 }, { idObjeto: '8' }],
      },
      skip: 5,
      take: 5,
    });
  });

  const INVALIDAS: [string, string][] = [
    ['tipo desconocido', '?tipo=LOGIN'],
    ['límite sobre el máximo', '?limit=51'],
    ['página cero', '?page=0'],
    ['fecha sin zona', '?desde=2026-10-11T00:00:00'],
    ['rango invertido', '?desde=2026-10-12T00:00:00Z&hasta=2026-10-11T00:00:00Z'],
    ['idUsuario no numérico', '?idUsuario=abc'],
    ['clave inesperada', '?tipoObjeto=TAREA'],
    ['clave de orden inesperada', '?orderBy=detalleJson'],
  ];

  it.each(INVALIDAS)('administrador, %s -> 400 y la bitácora no se lee', async (_nombre, consulta) => {
    const { status } = await pedir(consulta, tokens.admin);
    expect(status).toBe(400);
    expect(prisma.bitacoraAuditoria.findMany).not.toHaveBeenCalled();
  });

  it.each([['consulta válida', ''], ...INVALIDAS])('sin sesión, %s -> 401 sin leer la bitácora', async (_nombre, consulta) => {
    const { status, body } = await pedir(consulta);
    expect(status).toBe(401);
    expect(body).not.toHaveProperty('data');
    expect(prisma.bitacoraAuditoria.findMany).not.toHaveBeenCalled();
    expect(prisma.bitacoraAuditoria.count).not.toHaveBeenCalled();
  });

  it.each(['no-es-un-jwt', 'eyJhbGciOiJub25lIn0.eyJzdWIiOjcsInRpcG8iOiJhY2Nlc3MifQ.'])('token inválido (%s) -> 401', async (token) => {
    expect((await pedir('', token)).status).toBe(401);
    expect(prisma.bitacoraAuditoria.findMany).not.toHaveBeenCalled();
  });

  it('una cuenta desactivada con un token aún vigente -> 401', async () => {
    expect((await pedir('', tokens.desactivado)).status).toBe(401);
    expect(prisma.bitacoraAuditoria.findMany).not.toHaveBeenCalled();
  });

  it.each([['consulta válida', ''], ...INVALIDAS])('estudiante, %s -> 403 sin revelar la validación ni leer la bitácora', async (_nombre, consulta) => {
    const { status, body } = await pedir(consulta, tokens.estudiante);
    expect(status).toBe(403);
    expect(body.message).toBe('Acceso restringido a administradores');
    expect(body).not.toHaveProperty('data');
    expect(prisma.bitacoraAuditoria.findMany).not.toHaveBeenCalled();
    expect(prisma.bitacoraAuditoria.count).not.toHaveBeenCalled();
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s no existe: el endpoint es de solo lectura', async (method) => {
    const response = await fetch(`${http.url}/admin/eventos-seguridad`, {
      method,
      headers: { authorization: `Bearer ${tokens.admin}` },
    });
    expect(response.status).toBe(404);
    for (const escritura of ['create', 'update', 'delete', 'deleteMany'] as const) {
      expect(prisma.bitacoraAuditoria[escritura]).not.toHaveBeenCalled();
    }
  });

  it('no hay ruta de detalle bruto por id', async () => {
    expect((await pedir('/31', tokens.admin)).status).toBe(404);
  });
});

describe('FG01-C05: wiring de SecurityEventsController y SecurityEventsModule', () => {
  it('la ruta es admin/eventos-seguridad y solo expone un GET', () => {
    expect(Reflect.getMetadata(PATH_METADATA, SecurityEventsController)).toBe('admin/eventos-seguridad');
    const propios = Object.getOwnPropertyNames(SecurityEventsController.prototype).filter((nombre) => nombre !== 'constructor');
    expect(propios).toEqual(['list']);
    expect(Reflect.getMetadata(METHOD_METADATA, SecurityEventsController.prototype.list)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(PATH_METADATA, SecurityEventsController.prototype.list)).toBe('/');
  });

  it('autentica antes de autorizar: JwtAuthGuard y después RolesGuard, restringido a administrador', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, SecurityEventsController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_METADATA_KEY, SecurityEventsController)).toEqual(['administrador']);
  });

  it('el módulo registra controlador y lector, e importa la política de administración', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, SecurityEventsModule)).toEqual([SecurityEventsController]);
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, SecurityEventsModule)).toContain(SecurityEventsQueryService);
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, SecurityEventsModule)).toContain(ProjectPolicyModule);
  });

  it('el writer sigue siendo lo único que el módulo exporta', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, SecurityEventsModule)).toContain(SecurityEventsService);
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, SecurityEventsModule)).toEqual([SecurityEventsService]);
  });

  it('la política de administración no depende de este módulo (sin ciclo)', () => {
    const imports = (Reflect.getMetadata(MODULE_METADATA.IMPORTS, ProjectPolicyModule) ?? []) as unknown[];
    expect(imports).not.toContain(SecurityEventsModule);
  });

  it('AppModule importa SecurityEventsModule exactamente una vez', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];
    expect(imports.filter((modulo) => modulo === SecurityEventsModule)).toHaveLength(1);
  });
});
