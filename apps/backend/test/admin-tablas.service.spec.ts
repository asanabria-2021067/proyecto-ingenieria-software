import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdminTablasService, ENTIDADES, enmascararCorreo } from '../src/admin/admin-tablas.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const PROHIBIDO = /contrasena|password|token|hash|secret|clave|llave|mensaje|detalleJson|datosJson|justificacion|nota|sesionVersion/i;

function montar(opciones: { admin?: boolean; filas?: Record<string, unknown>[]; total?: number } = {}) {
  const { admin = true, filas = [], total = filas.length } = opciones;
  const modelo = {
    findMany: vi.fn().mockResolvedValue(filas),
    count: vi.fn().mockResolvedValue(total),
    findUnique: vi.fn().mockResolvedValue(filas[0] ?? null),
  };
  const prisma = {
    usuarioRolAcceso: { findFirst: vi.fn().mockResolvedValue(admin ? { idUsuarioRolAcceso: 1 } : null) },
    bitacoraAuditoria: { create: vi.fn().mockResolvedValue({}) },
    usuario: modelo,
    proyecto: modelo,
    sprint: modelo,
  };
  return { service: new AdminTablasService(prisma as unknown as PrismaService), prisma, modelo };
}

const USUARIO = {
  idUsuario: 7,
  correo: 'juan@uvg.edu.gt',
  nombre: 'Juan',
  apellido: 'Pérez',
  estado: 'ACTIVO',
  fechaCreacion: new Date('2026-01-01T00:00:00Z'),
  fechaUltimaSesion: null,
};

describe('lista blanca de entidades y columnas', () => {
  it('expone exactamente las once entidades permitidas, sin chat ni mensajes', () => {
    expect(Object.keys(ENTIDADES).sort()).toEqual(
      [
        'asociaciones',
        'bitacora',
        'horas',
        'notificaciones',
        'organizaciones',
        'postulaciones',
        'proyectos',
        'roles-proyecto',
        'sprints',
        'tareas',
        'usuarios',
      ].sort(),
    );
  });

  it('ninguna columna permitida es una contraseña, token, secreto, llave ni contenido libre', () => {
    for (const [clave, entidad] of Object.entries(ENTIDADES)) {
      expect(entidad.columnas.filter((c) => PROHIBIDO.test(c)), clave).toEqual([]);
    }
  });

  it('los correos se declaran para enmascarar', () => {
    expect(ENTIDADES.usuarios.correos).toEqual(['correo']);
    expect(enmascararCorreo('juan@uvg.edu.gt')).toBe('j***@uvg.edu.gt');
  });
});

describe('AdminTablasService', () => {
  it('listarEntidades devuelve las entidades al administrador', async () => {
    const { service } = montar();
    const lista = await service.listarEntidades(1);
    expect(lista).toHaveLength(11);
    expect(lista.find((e) => e.clave === 'usuarios')?.columnas).not.toContain('contrasena');
  });

  it.each(['listarEntidades', 'consultar', 'detalle', 'exportar'] as const)('%s: quien no es administrador recibe 403 y no consulta', async (metodo) => {
    const { service, modelo, prisma } = montar({ admin: false });
    const llamada =
      metodo === 'listarEntidades'
        ? service.listarEntidades(5)
        : metodo === 'detalle'
          ? service.detalle(5, 'usuarios', 1)
          : service[metodo](5, 'usuarios', {});
    await expect(llamada).rejects.toBeInstanceOf(ForbiddenException);
    expect(modelo.findMany).not.toHaveBeenCalled();
    expect(modelo.findUnique).not.toHaveBeenCalled();
    expect(prisma.bitacoraAuditoria.create).not.toHaveBeenCalled();
  });

  it('consultar lee solo las columnas de la lista blanca y enmascara el correo', async () => {
    const { service, modelo } = montar({ filas: [USUARIO] });
    const res = await service.consultar(1, 'usuarios', {});
    const { select } = modelo.findMany.mock.calls[0][0];
    expect(Object.keys(select)).toEqual(ENTIDADES.usuarios.columnas);
    expect(select).not.toHaveProperty('contrasena');
    expect(res.filas[0].correo).toBe('j***@uvg.edu.gt');
    expect(JSON.stringify(res)).not.toContain('juan@uvg.edu.gt');
    expect(res).toMatchObject({ total: 1, pagina: 1, limite: 20 });
  });

  it('aplica búsqueda, filtros, orden y paginación', async () => {
    const { service, modelo } = montar();
    await service.consultar(1, 'usuarios', { q: 'ana', filtros: 'estado:ACTIVO', orden: 'nombre', dir: 'asc', pagina: 3, limite: 10 });
    expect(modelo.findMany.mock.calls[0][0]).toMatchObject({
      where: { estado: 'ACTIVO', OR: [{ nombre: { contains: 'ana', mode: 'insensitive' } }, { apellido: { contains: 'ana', mode: 'insensitive' } }, { correo: { contains: 'ana', mode: 'insensitive' } }] },
      orderBy: [{ nombre: 'asc' }, { idUsuario: 'desc' }],
      skip: 20,
      take: 10,
    });
  });

  it('cada consulta, detalle y exportación queda en la bitácora', async () => {
    const { service, prisma } = montar({ filas: [USUARIO] });
    await service.consultar(1, 'usuarios', {});
    await service.detalle(1, 'usuarios', 7);
    await service.exportar(1, 'usuarios', {});
    const acciones = prisma.bitacoraAuditoria.create.mock.calls.map((c) => c[0].data);
    expect(acciones.map((a: { accion: string }) => a.accion)).toEqual([
      'ADMIN_TABLA_CONSULTA',
      'ADMIN_TABLA_DETALLE',
      'ADMIN_TABLA_EXPORTACION',
    ]);
    expect(acciones.every((a: { idUsuario: number; tipoObjeto: string }) => a.idUsuario === 1 && a.tipoObjeto === 'Tabla:usuarios')).toBe(true);
    expect(acciones[1].idObjeto).toBe('7');
  });

  it('el detalle devuelve el correo completo', async () => {
    const { service } = montar({ filas: [USUARIO] });
    expect((await service.detalle(1, 'usuarios', 7)).correo).toBe('juan@uvg.edu.gt');
  });

  it('el detalle de un registro inexistente es 404', async () => {
    const { service } = montar();
    await expect(service.detalle(1, 'usuarios', 99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each(['mensajes', 'conversaciones', 'chat', 'constructor', '__proto__', 'refreshToken', 'toString'])('entidad fuera de la lista (%s) se rechaza', async (clave) => {
    const { service, modelo } = montar();
    await expect(service.consultar(1, clave, {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.detalle(1, clave, 1)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.exportar(1, clave, {})).rejects.toBeInstanceOf(NotFoundException);
    expect(modelo.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ['orden con columna prohibida', { orden: 'contrasena' }],
    ['orden con inyección', { orden: 'nombre; DROP TABLE usuario' }],
    ['filtro con columna prohibida', { filtros: 'contrasena:x' }],
    ['filtro con propiedad heredada', { filtros: 'constructor:x' }],
    ['filtro con enum inválido', { filtros: 'estado:NO_EXISTE' }],
    ['filtro con valor entero inválido', { filtros: 'estado:ACTIVO,idUsuario:1 OR 1=1' }],
  ] as const)('%s -> 400 y no se consulta', async (_nombre, query) => {
    const { service, modelo } = montar();
    await expect(service.consultar(1, 'usuarios', query)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.exportar(1, 'usuarios', query)).rejects.toBeInstanceOf(BadRequestException);
    expect(modelo.findMany).not.toHaveBeenCalled();
  });

  it('una entidad sin columnas de texto rechaza la búsqueda', async () => {
    const { service } = montar();
    await expect(service.consultar(1, 'sprints', { q: 'x' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el CSV usa solo las columnas permitidas, enmascara correos y neutraliza fórmulas', async () => {
    const { service } = montar({
      filas: [
        { ...USUARIO, nombre: '=HYPERLINK("http://x.invalid")', apellido: '+cmd' },
        { ...USUARIO, idUsuario: 8, nombre: '-1', apellido: '@SUM(A1)' },
      ],
    });
    const csv = await service.exportar(1, 'usuarios', {});
    const lineas = csv.replace('﻿', '').trim().split('\r\n');
    expect(lineas[0]).toBe(ENTIDADES.usuarios.columnas.join(';'));
    expect(csv).not.toMatch(/contrasena/i);
    expect(csv).not.toContain('juan@uvg.edu.gt');
    expect(csv).toContain('j***@uvg.edu.gt');
    expect(csv).toContain(`"'=HYPERLINK(""http://x.invalid"")"`);
    expect(csv).toContain("'+cmd");
    expect(csv).toContain("'-1");
    expect(csv).toContain("'@SUM(A1)");
  });

  it('la exportación se limita a 5000 filas', async () => {
    const { service, modelo } = montar();
    await service.exportar(1, 'proyectos', {});
    expect(modelo.findMany.mock.calls[0][0].take).toBe(5000);
  });
});

describe('AdminTablasQueryDto', () => {
  it('una página enorme es 400 de validación, no un desborde en la base', async () => {
    const { plainToInstance } = await import('class-transformer');
    const { validate } = await import('class-validator');
    const { AdminTablasQueryDto } = await import('../src/admin/dto/admin-tablas-query.dto');
    const errores = await validate(plainToInstance(AdminTablasQueryDto, { pagina: '99999999999999' }));
    expect(errores.map((e) => e.property)).toEqual(['pagina']);
    expect(await validate(plainToInstance(AdminTablasQueryDto, { pagina: '3' }))).toEqual([]);
  }, 20_000);
});
