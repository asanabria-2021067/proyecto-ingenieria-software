import { JwtService } from '@nestjs/jwt';
import { EstadoHoras, Prisma, TipoProyecto } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { AdminService } from '../src/admin/admin.service';

/**
 * HU-176 (T-291). GET /admin/estadisticas calcula las horas de extensión de
 * los estudiantes en riesgo con una sola consulta, no una por estudiante.
 */

interface Perfil {
  idUsuario: number;
  semestre: number;
  horasExtensionRequeridas: number | null;
  nombre: string;
}

interface Hora {
  idUsuario: number;
  horas: string | null;
}

function setup(perfiles: Perfil[], horas: Hora[]) {
  const prisma = {
    usuarioRolAcceso: { findFirst: vi.fn().mockResolvedValue({ idUsuario: 1 }) },
    proyecto: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    usuario: { count: vi.fn().mockResolvedValue(0) },
    perfilEstudiante: {
      findMany: vi.fn().mockResolvedValue(
        perfiles.map((p) => ({
          idUsuario: p.idUsuario,
          semestre: p.semestre,
          horasExtensionRequeridas: p.horasExtensionRequeridas,
          usuario: { nombre: p.nombre, apellido: 'Prueba' },
        })),
      ),
    },
    horasParticipacion: {
      findMany: vi.fn().mockResolvedValue(
        horas.map((h) => ({
          horasAprobadas: h.horas === null ? null : new Prisma.Decimal(h.horas),
          participacion: { idUsuario: h.idUsuario },
        })),
      ),
    },
  };
  const admin = new AdminService(prisma as unknown as PrismaService, new JwtService({}));
  return { admin, prisma };
}

describe('AdminService.getEstadisticas — estudiantes en riesgo', () => {
  it('consulta las horas de todos los perfiles en una sola llamada', async () => {
    const perfiles = [1, 2, 3].map((id) => ({
      idUsuario: id,
      semestre: 8,
      horasExtensionRequeridas: 100,
      nombre: `Est${id}`,
    }));
    const { admin, prisma } = setup(perfiles, []);

    await admin.getEstadisticas(1);

    expect(prisma.horasParticipacion.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.horasParticipacion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          participacion: {
            idUsuario: { in: [1, 2, 3] },
            rolProyecto: {
              proyecto: { tipoProyecto: TipoProyecto.EXTRACURRICULAR_EXTENSION },
            },
          },
          estadoHoras: EstadoHoras.APROBADA,
        },
      }),
    );
  });

  it('suma las horas de cada estudiante sin mezclarlas y ordena de menos a más', async () => {
    const perfiles = [
      { idUsuario: 10, semestre: 7, horasExtensionRequeridas: 120, nombre: 'Ana' },
      { idUsuario: 20, semestre: 9, horasExtensionRequeridas: null, nombre: 'Beto' },
      { idUsuario: 30, semestre: 8, horasExtensionRequeridas: 80, nombre: 'Carla' },
    ];
    const horas = [
      { idUsuario: 10, horas: '10.25' },
      { idUsuario: 20, horas: '3.10' },
      { idUsuario: 10, horas: '5.50' },
      { idUsuario: 20, horas: null },
      { idUsuario: 20, horas: '0.20' },
    ];
    const { admin } = setup(perfiles, horas);

    const { estudiantesEnRiesgo } = await admin.getEstadisticas(1);

    expect(estudiantesEnRiesgo).toEqual([
      {
        idUsuario: 30,
        nombre: 'Carla',
        apellido: 'Prueba',
        semestre: 8,
        horasExtension: 0,
        horasExtensionRequeridas: 80,
      },
      {
        idUsuario: 20,
        nombre: 'Beto',
        apellido: 'Prueba',
        semestre: 9,
        horasExtension: 3.3,
        horasExtensionRequeridas: 100,
      },
      {
        idUsuario: 10,
        nombre: 'Ana',
        apellido: 'Prueba',
        semestre: 7,
        horasExtension: 15.75,
        horasExtensionRequeridas: 120,
      },
    ]);
  });

  it('devuelve como máximo cinco estudiantes', async () => {
    const perfiles = Array.from({ length: 7 }, (_, i) => ({
      idUsuario: i + 1,
      semestre: 8,
      horasExtensionRequeridas: 100,
      nombre: `Est${i + 1}`,
    }));
    const { admin } = setup(perfiles, []);

    const { estudiantesEnRiesgo } = await admin.getEstadisticas(1);

    expect(estudiantesEnRiesgo).toHaveLength(5);
  });

  it('sin perfiles en riesgo no consulta horas y devuelve una lista vacía', async () => {
    const { admin, prisma } = setup([], []);

    const { estudiantesEnRiesgo } = await admin.getEstadisticas(1);

    expect(estudiantesEnRiesgo).toEqual([]);
    expect(prisma.horasParticipacion.findMany).not.toHaveBeenCalled();
  });
});
