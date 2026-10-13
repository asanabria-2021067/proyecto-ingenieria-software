import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { ProjectPolicyService } from '../src/common/project-policy/project-policy.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { SecurityEventsQueryService } from '../src/security-events/security-events-query.service';

/**
 * FG01 (T-310). Lector administrativo de eventos de seguridad, con un doble de
 * Prisma: qué se le pide a la base y qué sale del servicio.
 */

interface Escenario {
  /** Estado de la cuenta del actor; null = la cuenta ya no existe. */
  estado?: 'ACTIVO' | 'INACTIVO' | 'BLOQUEADO' | null;
  esAdmin?: boolean;
  filas?: unknown[];
  total?: number;
  usuarios?: { idUsuario: number; nombre: string; apellido: string }[];
}

function crear({ estado = 'ACTIVO', esAdmin = true, filas = [], total = filas.length, usuarios = [] }: Escenario = {}) {
  const prisma = {
    usuario: {
      findUnique: vi.fn().mockResolvedValue(estado ? { estado } : null),
      findMany: vi.fn().mockResolvedValue(usuarios),
    },
    usuarioRolAcceso: { findFirst: vi.fn().mockResolvedValue(esAdmin ? { idUsuarioRolAcceso: 1 } : null) },
    bitacoraAuditoria: { findMany: vi.fn().mockResolvedValue(filas), count: vi.fn().mockResolvedValue(total) },
    $transaction: vi.fn((operaciones: Promise<unknown>[]) => Promise.all(operaciones)),
  };
  const policy = new ProjectPolicyService({} as never);
  const service = new SecurityEventsQueryService(prisma as unknown as PrismaService, policy);
  return { service, prisma, policy };
}

describe('FG01-C02: solo un administrador vigente lee eventos de seguridad', () => {
  it('un administrador activo llega a la bitácora', async () => {
    const { service, prisma } = crear();
    await expect(service.list(7)).resolves.toMatchObject({ data: [], total: 0 });
    expect(prisma.usuario.findUnique).toHaveBeenCalledWith({ where: { idUsuario: 7 }, select: { estado: true } });
    expect(prisma.bitacoraAuditoria.findMany).toHaveBeenCalledTimes(1);
  });

  it('el rol lo decide la política existente, consultada contra la base', async () => {
    const { service, prisma, policy } = crear();
    const assertAdminTx = vi.spyOn(policy, 'assertAdminTx');
    await service.list(7);
    expect(assertAdminTx).toHaveBeenCalledTimes(1);
    expect(assertAdminTx.mock.calls[0][1]).toBe(7);
    expect(prisma.usuarioRolAcceso.findFirst).toHaveBeenCalledWith({
      where: { idUsuario: 7, rolAcceso: { nombrePerfil: 'administrador' } },
      select: { idUsuarioRolAcceso: true },
    });
  });

  it.each([
    ['un estudiante activo', { esAdmin: false }],
    ['un administrador desactivado', { estado: 'INACTIVO' }],
    ['un administrador bloqueado', { estado: 'BLOQUEADO' }],
    ['una cuenta eliminada con un token aún vigente', { estado: null }],
  ] as [string, Escenario][])('%s recibe 403 y la bitácora no se lee', async (_nombre, escenario) => {
    const { service, prisma } = crear(escenario);
    const intento = service.list(8);
    await expect(intento).rejects.toBeInstanceOf(ForbiddenException);
    await expect(intento).rejects.toThrow('Acceso restringido a administradores');
    expect(prisma.bitacoraAuditoria.findMany).not.toHaveBeenCalled();
    expect(prisma.bitacoraAuditoria.count).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('una cuenta no activa se rechaza sin consultar siquiera el rol', async () => {
    const { service, prisma } = crear({ estado: 'BLOQUEADO' });
    await expect(service.list(8)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.usuarioRolAcceso.findFirst).not.toHaveBeenCalled();
  });

  it('una falla al comprobar el acceso se propaga y no se lee nada', async () => {
    const { service, prisma } = crear();
    prisma.usuario.findUnique.mockRejectedValueOnce(new Error('conexión perdida'));
    await expect(service.list(7)).rejects.toThrow('conexión perdida');
    expect(prisma.bitacoraAuditoria.findMany).not.toHaveBeenCalled();
  });
});

describe('FG01-C03: filtros y paginación', () => {
  const ALCANCE = {
    tipoObjeto: 'SEGURIDAD_CUENTA',
    accion: {
      in: [
        'LOGIN_FAILED',
        'LOGIN_SUCCEEDED',
        'ACCOUNT_LOCKED',
        'PASSWORD_RESET_ISSUED',
        'PASSWORD_RESET_COMPLETED',
        'USER_STATUS_CHANGED',
      ],
    },
  };

  async function consulta(query: Parameters<SecurityEventsQueryService['list']>[1], escenario: Escenario = {}) {
    const { service, prisma } = crear(escenario);
    const resultado = await service.list(7, query);
    return { resultado, findMany: prisma.bitacoraAuditoria.findMany.mock.calls[0][0], prisma };
  }

  it('sin filtros se limita a los eventos de seguridad del catálogo', async () => {
    const { findMany } = await consulta({});
    expect(findMany.where).toEqual(ALCANCE);
  });

  it('ordena por fecha descendente y desempata por idAuditoria: el orden es total', async () => {
    const { findMany } = await consulta({});
    expect(findMany.orderBy).toEqual([{ fechaEvento: 'desc' }, { idAuditoria: 'desc' }]);
  });

  it('pide solo las columnas que usa, sin relaciones (sin N+1)', async () => {
    const { findMany, prisma } = await consulta({});
    expect(findMany).not.toHaveProperty('include');
    expect(Object.values(findMany.select).every((valor) => valor === true)).toBe(true);
    expect(findMany.select).not.toHaveProperty('usuario');
    expect(prisma.bitacoraAuditoria.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.bitacoraAuditoria.count).toHaveBeenCalledTimes(1);
  });

  it('filtra por tipo sin soltar el tipoObjeto de seguridad', async () => {
    const { findMany } = await consulta({ tipo: 'ACCOUNT_LOCKED' });
    expect(findMany.where).toEqual({ tipoObjeto: 'SEGURIDAD_CUENTA', accion: 'ACCOUNT_LOCKED' });
  });

  it('el rango de fechas es inclusivo en ambos extremos y se compara por instante', async () => {
    const { findMany } = await consulta({ desde: '2026-10-11T00:00:00-06:00', hasta: '2026-10-11T23:59:59.999-06:00' });
    expect(findMany.where.fechaEvento).toEqual({
      gte: new Date('2026-10-11T06:00:00.000Z'),
      lte: new Date('2026-10-12T05:59:59.999Z'),
    });
  });

  it.each([
    ['desde', { desde: '2026-10-11T06:00:00Z' }, { gte: new Date('2026-10-11T06:00:00.000Z') }],
    ['hasta', { hasta: '2026-10-11T06:00:00Z' }, { lte: new Date('2026-10-11T06:00:00.000Z') }],
  ])('acepta solo %s', async (_nombre, query, esperado) => {
    const { findMany } = await consulta(query);
    expect(findMany.where.fechaEvento).toEqual(esperado);
  });

  it('idUsuario encuentra a la persona como actor o como cuenta afectada', async () => {
    const { findMany } = await consulta({ idUsuario: 42 });
    expect(findMany.where).toEqual({ ...ALCANCE, OR: [{ idUsuario: 42 }, { idObjeto: '42' }] });
  });

  it('combina todos los filtros sin perder el alcance de seguridad', async () => {
    const { findMany } = await consulta({
      tipo: 'LOGIN_FAILED',
      desde: '2026-10-01T00:00:00Z',
      hasta: '2026-10-31T00:00:00Z',
      idUsuario: 42,
    });
    expect(findMany.where).toEqual({
      tipoObjeto: 'SEGURIDAD_CUENTA',
      accion: 'LOGIN_FAILED',
      fechaEvento: { gte: new Date('2026-10-01T00:00:00.000Z'), lte: new Date('2026-10-31T00:00:00.000Z') },
      OR: [{ idUsuario: 42 }, { idObjeto: '42' }],
    });
  });

  it('el conteo usa exactamente el mismo filtro que la página, en una sola transacción', async () => {
    const { findMany, prisma } = await consulta({ tipo: 'LOGIN_FAILED', idUsuario: 42 });
    expect(prisma.bitacoraAuditoria.count).toHaveBeenCalledWith({ where: findMany.where });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{}, 0, 20],
    [{ page: 1, limit: 50 }, 0, 50],
    [{ page: 3, limit: 10 }, 20, 10],
    [{ page: 2 }, 20, 20],
  ])('la consulta %j salta %i y toma %i', async (query, skip, take) => {
    const { findMany } = await consulta(query);
    expect(findMany).toMatchObject({ skip, take });
  });

  it.each([
    [0, 20, 0],
    [1, 20, 1],
    [20, 20, 1],
    [21, 20, 2],
    [101, 50, 3],
  ])('con %i eventos y limit=%i hay %i páginas', async (total, limit, totalPages) => {
    const { resultado } = await consulta({ limit }, { total });
    expect(resultado).toMatchObject({ total, page: 1, totalPages });
  });

  it('una página más allá de la última devuelve una lista vacía con el total real', async () => {
    const { resultado, findMany } = await consulta({ page: 9, limit: 20 }, { filas: [], total: 21 });
    expect(findMany.skip).toBe(160);
    expect(resultado).toMatchObject({ data: [], total: 21, page: 9, totalPages: 2 });
  });

  it('informa el catálogo real de tipos para poblar el filtro', async () => {
    const { resultado } = await consulta({});
    expect(resultado.tipos).toEqual(ALCANCE.accion.in);
  });
});

describe('FG01-C04: proyección por lista de permitidos', () => {
  const FECHA = new Date('2026-10-11T06:00:00.000Z');
  const SECRETOS = ['s3cr3t-valor', 'tok-123', 'hunter2', 'intento@uvg.edu.gt', 'https://uvg.test/reset?token=abc'];

  function fila(parcial: Record<string, unknown> = {}) {
    return {
      idAuditoria: 1,
      accion: 'LOGIN_FAILED',
      idUsuario: null,
      idObjeto: null,
      detalleJson: null,
      ipOrigen: null,
      fechaEvento: FECHA,
      ...parcial,
    };
  }

  async function proyectar(filas: unknown[], usuarios: Escenario['usuarios'] = []) {
    const { service, prisma } = crear({ filas, usuarios });
    const { data } = await service.list(7);
    return { data, prisma, json: JSON.stringify(data) };
  }

  it('cada evento sale con exactamente las claves del contrato', async () => {
    const { data } = await proyectar([fila()]);
    expect(Object.keys(data[0]).sort()).toEqual(['actor', 'cuenta', 'detalle', 'fecha', 'id', 'origen', 'tipo']);
    expect(data[0]).toEqual({
      id: 1,
      tipo: 'LOGIN_FAILED',
      fecha: '2026-10-11T06:00:00.000Z',
      actor: null,
      cuenta: null,
      origen: { ip: null, ipConfiable: false },
      detalle: {},
    });
  });

  it.each([
    [
      'LOGIN_FAILED',
      { motivo: 'CREDENCIALES', cuentaConocida: false, cuentaRef: '0123456789abcdef', ipTrusted: false },
      { motivo: 'CREDENCIALES', cuentaConocida: false, cuentaRef: '0123456789abcdef' },
    ],
    ['LOGIN_FAILED', { motivo: 'BLOQUEO_TEMPORAL', cuentaConocida: true }, { motivo: 'BLOQUEO_TEMPORAL', cuentaConocida: true }],
    ['LOGIN_FAILED', { motivo: 'CUENTA_NO_ACTIVA', cuentaConocida: true }, { motivo: 'CUENTA_NO_ACTIVA', cuentaConocida: true }],
    ['LOGIN_SUCCEEDED', { ipTrusted: true }, {}],
    ['ACCOUNT_LOCKED', { cuentaConocida: true }, { cuentaConocida: true }],
    [
      'ACCOUNT_LOCKED',
      { cuentaConocida: false, cuentaRef: 'fedcba9876543210' },
      { cuentaConocida: false, cuentaRef: 'fedcba9876543210' },
    ],
    [
      'PASSWORD_RESET_ISSUED',
      { idSolicitud: 12, expiraEn: '2026-10-11T07:00:00.000Z' },
      { idSolicitud: 12, expiraEn: '2026-10-11T07:00:00.000Z' },
    ],
    ['PASSWORD_RESET_COMPLETED', { idSolicitud: 12, sesionesRevocadas: 3 }, { idSolicitud: 12, sesionesRevocadas: 3 }],
    [
      'USER_STATUS_CHANGED',
      { estadoAnterior: 'ACTIVO', estadoNuevo: 'BLOQUEADO' },
      { estadoAnterior: 'ACTIVO', estadoNuevo: 'BLOQUEADO' },
    ],
  ])('%s conserva el detalle que escribe su productor (%j)', async (accion, detalleJson, esperado) => {
    const { data } = await proyectar([fila({ accion, detalleJson })]);
    expect(data[0].tipo).toBe(accion);
    expect(data[0].detalle).toEqual(esperado);
  });

  it.each(['LOGIN_FAILED', 'LOGIN_SUCCEEDED', 'ACCOUNT_LOCKED', 'PASSWORD_RESET_ISSUED', 'PASSWORD_RESET_COMPLETED', 'USER_STATUS_CHANGED'])(
    '%s nunca deja pasar claves fuera de la lista ni estructuras anidadas',
    async (accion) => {
      const { data, json } = await proyectar([
        fila({
          accion,
          detalleJson: {
            token: SECRETOS[1],
            resetToken: SECRETOS[1],
            resetUrl: SECRETOS[4],
            password: SECRETOS[2],
            contrasena: SECRETOS[2],
            secret: SECRETOS[0],
            correo: SECRETOS[3],
            correoIntentado: SECRETOS[3],
            idProyecto: 5,
            metadata: { nested: { secret: SECRETOS[0], lista: [SECRETOS[1]] } },
            // Claves permitidas con una forma que no es la esperada.
            motivo: { $ne: SECRETOS[0] },
            cuentaRef: SECRETOS[3],
            cuentaConocida: SECRETOS[2],
            idSolicitud: { id: SECRETOS[1] },
            expiraEn: SECRETOS[4],
            sesionesRevocadas: [SECRETOS[0]],
            estadoAnterior: SECRETOS[0],
            estadoNuevo: { estado: SECRETOS[2] },
          },
        }),
      ]);
      expect(data[0].detalle).toEqual({});
      for (const secreto of SECRETOS) expect(json).not.toContain(secreto);
      for (const clave of ['token', 'password', 'contrasena', 'secret', 'correo', 'metadata', 'idProyecto', 'detalleJson', 'ipTrusted']) {
        expect(json).not.toContain(`"${clave}`);
      }
    },
  );

  it.each([null, 'texto', 7, true, ['LOGIN_FAILED'], [{ motivo: 'CREDENCIALES' }]])(
    'un detalleJson que no es un objeto (%j) da un detalle vacío',
    async (detalleJson) => {
      const { data } = await proyectar([fila({ detalleJson })]);
      expect(data[0].detalle).toEqual({});
      expect(data[0].origen.ipConfiable).toBe(false);
    },
  );

  it('no toma del prototipo una clave permitida', async () => {
    const detalleJson = Object.create({ motivo: 'CREDENCIALES', ipTrusted: true });
    const { data } = await proyectar([fila({ detalleJson })]);
    expect(data[0].detalle).toEqual({});
  });

  it.each([
    [true, true],
    [false, false],
    ['true', false],
    [1, false],
    [undefined, false],
  ])('ipTrusted=%j en el registro se informa como ipConfiable=%j', async (ipTrusted, ipConfiable) => {
    const { data } = await proyectar([fila({ ipOrigen: '203.0.113.9', detalleJson: { ipTrusted } })]);
    expect(data[0].origen).toEqual({ ip: '203.0.113.9', ipConfiable });
  });

  it.each([
    ['203.0.113.9', '203.0.113.9'],
    ['2001:db8::1', '2001:db8::1'],
    ['203.0.113.9, 10.0.0.1', null],
    ['<script>alert(1)</script>', null],
    ['', null],
    [null, null],
  ])('la IP %j se informa como %j', async (ipOrigen, ip) => {
    const { data } = await proyectar([fila({ ipOrigen })]);
    expect(data[0].origen.ip).toBe(ip);
  });

  it('resuelve actor y cuenta afectada con una sola consulta por página', async () => {
    const { data, prisma } = await proyectar(
      [
        fila({ idAuditoria: 3, accion: 'USER_STATUS_CHANGED', idUsuario: 7, idObjeto: '42' }),
        fila({ idAuditoria: 2, accion: 'LOGIN_SUCCEEDED', idUsuario: 42, idObjeto: '42' }),
        fila({ idAuditoria: 1, accion: 'PASSWORD_RESET_ISSUED', idUsuario: 7, idObjeto: '42' }),
      ],
      [
        { idUsuario: 7, nombre: 'Ada', apellido: 'Admin' },
        { idUsuario: 42, nombre: 'Eva', apellido: 'Estudiante' },
      ],
    );
    expect(prisma.usuario.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.usuario.findMany).toHaveBeenCalledWith({
      where: { idUsuario: { in: [7, 42] } },
      select: { idUsuario: true, nombre: true, apellido: true },
    });
    expect(data[0].actor).toEqual({ idUsuario: 7, nombre: 'Ada Admin' });
    expect(data[0].cuenta).toEqual({ idUsuario: 42, nombre: 'Eva Estudiante' });
    expect(data[1].actor).toEqual(data[1].cuenta);
  });

  it('de las cuentas solo sale el id y el nombre, nunca el correo', async () => {
    const { json } = await proyectar(
      [fila({ idUsuario: 7, idObjeto: '7' })],
      [{ idUsuario: 7, nombre: 'Ada', apellido: 'Admin', correo: SECRETOS[3], contrasena: SECRETOS[2] } as never],
    );
    expect(json).not.toContain(SECRETOS[3]);
    expect(json).not.toContain(SECRETOS[2]);
  });

  it('una cuenta eliminada conserva su id con nombre null', async () => {
    const { data } = await proyectar([fila({ idUsuario: 7, idObjeto: '99' })], [{ idUsuario: 7, nombre: 'Ada', apellido: 'Admin' }]);
    expect(data[0].cuenta).toEqual({ idUsuario: 99, nombre: null });
  });

  it('un evento sin actor ni cuenta no consulta usuarios', async () => {
    const { data, prisma } = await proyectar([fila({ detalleJson: { motivo: 'CREDENCIALES', cuentaConocida: false } })]);
    expect(data[0]).toMatchObject({ actor: null, cuenta: null });
    expect(prisma.usuario.findMany).not.toHaveBeenCalled();
  });

  it.each(['abc', '42abc', '4 2', '-1', '0', '007', '1.5', '2147483648', '99999999999', "1' OR '1'='1"])(
    'un idObjeto que no es un id de usuario (%j) no se trata como cuenta',
    async (idObjeto) => {
      const { data, prisma } = await proyectar([fila({ idObjeto })]);
      expect(data[0].cuenta).toBeNull();
      expect(prisma.usuario.findMany).not.toHaveBeenCalled();
    },
  );

  it('descarta una fila cuya acción no es del catálogo aunque la base la devolviera', async () => {
    const { data } = await proyectar([fila({ accion: 'TASK_CREATED' }), fila({ idAuditoria: 2 })]);
    expect(data.map((evento) => evento.id)).toEqual([2]);
  });
});
