import { ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminService } from '../src/admin/admin.service';
import { HorasSemestreService } from '../src/horas-semestre/horas-semestre.service';
import { SecurityEventsService } from '../src/security-events/security-events.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const admin = (esAdmin = true) => ({
  findFirst: vi.fn().mockResolvedValue(esAdmin ? { idUsuario: 1 } : null),
});

describe('MEJ-69 bandeja unica de pendientes', () => {
  function setup(esAdmin = true) {
    const prisma = {
      usuarioRolAcceso: admin(esAdmin),
      usuario: { count: vi.fn().mockResolvedValue(3) },
      proyecto: {
        count: vi.fn(async ({ where }: { where: { estadoProyecto: string } }) =>
          where.estadoProyecto === 'EN_REVISION' ? 2 : 1,
        ),
      },
      solicitudRecuperacion: { count: vi.fn().mockResolvedValue(4) },
      apelacionLiderazgo: { count: vi.fn().mockResolvedValue(5) },
      solicitudDesactivacion: { count: vi.fn().mockResolvedValue(2) },
    };
    return new AdminService(prisma as unknown as PrismaService, new JwtService({}));
  }

  it('devuelve cada contador y el total', async () => {
    const r = await setup().getPendientes(1);
    expect(r.items).toEqual([
      { clave: 'cuentas', total: 3 },
      { clave: 'revisiones', total: 2 },
      { clave: 'cierres', total: 1 },
      { clave: 'recuperaciones', total: 4 },
      { clave: 'apelaciones', total: 5 },
      { clave: 'desactivaciones', total: 2 },
    ]);
    expect(r.total).toBe(17);
  });

  it('un no administrador recibe 403', async () => {
    await expect(setup(false).getPendientes(9)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('MEJ-70 aprobar cuentas en lote', () => {
  function setup(estados: Record<number, string>, esAdmin = true) {
    const prisma = {
      usuarioRolAcceso: admin(esAdmin),
      usuario: {
        findUnique: vi.fn(async ({ where }: { where: { idUsuario: number } }) =>
          estados[where.idUsuario]
            ? { idUsuario: where.idUsuario, nombre: 'N', apellido: 'A', correo: 'c@uvg.edu.gt', estado: estados[where.idUsuario] }
            : null,
        ),
        updateMany: vi.fn(async ({ where }: { where: { idUsuario: number } }) => ({
          count: estados[where.idUsuario] === 'PENDIENTE_VERIFICACION' ? 1 : 0,
        })),
      },
      bitacoraAuditoria: { create: vi.fn().mockResolvedValue({}) },
    };
    const notifications = { notifyFromTemplate: vi.fn().mockResolvedValue(undefined) };
    const servicio = new AdminService(
      prisma as unknown as PrismaService,
      new JwtService({}),
      new SecurityEventsService(prisma as unknown as PrismaService),
      undefined,
      notifications as unknown as NotificationsService,
    );
    return { servicio, prisma, notifications };
  }

  it('aprueba las pendientes, omite las ya atendidas o inexistentes y notifica solo a las aprobadas', async () => {
    const { servicio, notifications } = setup({ 5: 'PENDIENTE_VERIFICACION', 6: 'ACTIVO', 7: 'PENDIENTE_VERIFICACION' });
    const r = await servicio.aprobarCuentasLote(1, [5, 6, 7, 99]);
    expect(r.aprobadas).toEqual([5, 7]);
    expect(r.omitidas.map((o) => o.idUsuario)).toEqual([6, 99]);
    expect(notifications.notifyFromTemplate).toHaveBeenCalledTimes(2);
  });

  it('un no administrador recibe 403 y no toca ninguna cuenta', async () => {
    const { servicio, prisma } = setup({ 5: 'PENDIENTE_VERIFICACION' }, false);
    await expect(servicio.aprobarCuentasLote(9, [5])).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.usuario.updateMany).not.toHaveBeenCalled();
  });
});

describe('MEJ-72 comparativo y MEJ-68 resumen por asociacion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01T18:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('el comparativo trae los ultimos 4 semestres, el actual primero, con acreditadas por tipo', async () => {
    const prisma = {
      usuarioRolAcceso: admin(),
      registroHorasSemestre: {
        aggregate: vi.fn().mockResolvedValue({
          _count: { _all: 2 },
          _sum: { metaBeca: 200, becaDeclarada: 30, metaExtension: null, extensionDeclarada: 5 },
        }),
      },
      horasParticipacion: {
        findMany: vi.fn().mockResolvedValue([
          { horasAprobadas: 10, participacion: { rolProyecto: { proyecto: { tipoProyecto: 'ACADEMICO_HORAS_BECA' } } } },
          { horasAprobadas: 4, participacion: { rolProyecto: { proyecto: { tipoProyecto: 'EXTRACURRICULAR_EXTENSION' } } } },
        ]),
      },
    };
    const r = await new HorasSemestreService(prisma as never).comparativo(1);
    expect(r.semestres.map((s) => `${s.semestre.anio}-${s.semestre.periodo}`)).toEqual([
      '2026-1',
      '2025-2',
      '2025-1',
      '2024-2',
    ]);
    expect(r.semestres[0]).toMatchObject({
      estudiantesConRegistro: 2,
      metaBeca: 200,
      becaDeclarada: 30,
      becaAcreditada: 10,
      metaExtension: 0,
      extensionAcreditada: 4,
    });
  });

  it('el resumen suma solo a los estudiantes de las carreras de cada asociacion', async () => {
    const prisma = {
      usuarioRolAcceso: admin(),
      asociacion: {
        findMany: vi.fn().mockResolvedValue([
          {
            idAsociacion: 1,
            nombre: 'AECC',
            carreras: [{ idCarrera: 1, carrera: { nombreCarrera: 'Computacion' } }],
            proyectos: [{ idProyecto: 10 }],
            _count: { junta: 3 },
          },
        ]),
      },
      usuario: {
        findMany: vi.fn(async ({ where }: { where: { idUsuario: { gt: number } } }) =>
          [1, 2, 3]
            .filter((id) => id > where.idUsuario.gt)
            .map((id) => ({
              idUsuario: id,
              nombre: `N${id}`,
              apellido: `A${id}`,
              perfil: { carne: `c${id}`, idCarrera: id === 3 ? 2 : 1, semestre: 3, carrera: { nombreCarrera: 'X' } },
              registrosHorasSemestre: [{ metaBeca: 100, becaDeclarada: 10, metaExtension: null, extensionDeclarada: 0 }],
            })),
        ),
      },
      horasParticipacion: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const r = await new HorasSemestreService(prisma as never).resumenPorAsociacion(1, {});
    expect(r.asociaciones).toHaveLength(1);
    expect(r.asociaciones[0]).toMatchObject({
      estudiantes: 2,
      integrantesJunta: 3,
      proyectosActivos: 1,
      metaBeca: 200,
      becaDeclarada: 20,
      faltaBeca: 180,
    });
  });

  it('un no administrador recibe 403 en ambos', async () => {
    const servicio = new HorasSemestreService({ usuarioRolAcceso: admin(false) } as never);
    await expect(servicio.comparativo(9)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(servicio.resumenPorAsociacion(9, {})).rejects.toBeInstanceOf(ForbiddenException);
  });
});
