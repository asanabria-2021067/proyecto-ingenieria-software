import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { UsersService } from '../src/users/users.service';
import type { ProjectHoursSummaryService } from '../src/sprints/project-hours-summary.service';

function prismaMock() {
  const defaultTx = {
    usuario: { update: vi.fn() },
    perfilEstudiante: { update: vi.fn() },
    usuarioHabilidad: { deleteMany: vi.fn(), createMany: vi.fn() },
    usuarioInteres: { deleteMany: vi.fn(), createMany: vi.fn() },
    usuarioCualidad: { deleteMany: vi.fn(), createMany: vi.fn() },
  };

  const prisma = {
    usuario: { findUnique: vi.fn(), update: vi.fn() },
    perfilEstudiante: { update: vi.fn(), findUnique: vi.fn() },
    carrera: { findMany: vi.fn() },
    habilidad: { findMany: vi.fn() },
    interes: { findMany: vi.fn() },
    cualidad: { findMany: vi.fn() },
    usuarioHabilidad: { deleteMany: vi.fn(), createMany: vi.fn() },
    usuarioInteres: { deleteMany: vi.fn(), createMany: vi.fn() },
    usuarioCualidad: { deleteMany: vi.fn(), createMany: vi.fn() },
    experienciaPrevia: { create: vi.fn() },
    horasParticipacion: { aggregate: vi.fn() },
    participacionProyecto: { count: vi.fn() },
    postulacion: { findMany: vi.fn() },
    tarea: { findMany: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: typeof defaultTx) => unknown) => cb(defaultTx)),
  };
  return prisma as typeof prisma & PrismaService;
}

describe('UsersService', () => {
  it('getMe retorna usuario', async () => {
    const prisma = prismaMock();
    prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 1, rolesAcceso: [] });
    const service = new UsersService(prisma);
    await expect(service.getMe(1)).resolves.toEqual({ idUsuario: 1, rolesAcceso: [], roles: [] });
  });

  it('getMe falla si no existe', async () => {
    const prisma = prismaMock();
    prisma.usuario.findUnique.mockResolvedValue(null);
    const service = new UsersService(prisma);
    await expect(service.getMe(1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getProfileBootstrap mapea profile y catalogs', async () => {
    const prisma = prismaMock();
    prisma.usuario.findUnique.mockResolvedValue({
      nombre: 'Ana',
      apellido: 'Perez',
      correo: 'ana@uvg.edu',
      fotoUrl: null,
      perfil: { idCarrera: 1, carrera: { nombreCarrera: 'Ing' }, semestre: 3 },
      habilidades: [],
      intereses: [],
      cualidades: [],
    });
    prisma.carrera.findMany.mockResolvedValue([{ idCarrera: 1, nombreCarrera: 'Ing' }]);
    prisma.habilidad.findMany.mockResolvedValue([{ idHabilidad: 2, nombreHabilidad: 'TS' }]);
    prisma.interes.findMany.mockResolvedValue([{ idInteres: 3, nombreInteres: 'AI' }]);
    prisma.cualidad.findMany.mockResolvedValue([{ idCualidad: 4, nombreCualidad: 'Liderazgo' }]);
    const service = new UsersService(prisma);

    const result = await service.getProfileBootstrap(1);
    expect(result.profile.nombreCompleto).toBe('Ana Perez');
    expect(result.catalogs.carreras[0].id).toBe('1');
  });

  it('updateProfile usa nombreCompleto y retorna profile', async () => {
    const prisma = prismaMock();
    const tx = {
      usuario: { update: vi.fn() },
      perfilEstudiante: { update: vi.fn() },
    };
    prisma.$transaction = vi.fn(async (cb: (arg: typeof tx) => unknown) => cb(tx)) as typeof prisma.$transaction;
    prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 1 });
    const service = new UsersService(prisma);
    const getProfileSpy = vi
      .spyOn(service, 'getProfile')
      .mockResolvedValue({ ok: true } as unknown as Awaited<ReturnType<typeof service.getProfile>>);

    const result = await service.updateProfile(1, { nombreCompleto: 'Ana Perez', biografia: 'x' });

    expect(tx.usuario.update).toHaveBeenCalled();
    expect(tx.perfilEstudiante.update).toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
    getProfileSpy.mockRestore();
  });

  it('replaceIntereses reemplaza y retorna count', async () => {
    const prisma = prismaMock();
    const tx = { usuarioInteres: { deleteMany: vi.fn(), createMany: vi.fn() } };
    prisma.$transaction = vi.fn(async (cb: (arg: typeof tx) => unknown) => cb(tx)) as typeof prisma.$transaction;
    const service = new UsersService(prisma);

    const result = await service.replaceIntereses(1, [2, 3]);

    expect(tx.usuarioInteres.deleteMany).toHaveBeenCalled();
    expect(tx.usuarioInteres.createMany).toHaveBeenCalled();
    expect(result).toEqual({ count: 2 });
  });

  it('addExperiencia crea experiencia con tipo por defecto', async () => {
    const prisma = prismaMock();
    prisma.experienciaPrevia.create.mockResolvedValue({ idExperiencia: 1, tipoExperiencia: 'OTRO' });
    const service = new UsersService(prisma);

    const result = await service.addExperiencia(1, { tituloProyectoExperiencia: 'X', rolDesempenado: 'Dev' });
    expect(result.idExperiencia).toBe(1);
  });

  it('getDashboard agrega métricas', async () => {
    const prisma = prismaMock();
    prisma.perfilEstudiante.findUnique.mockResolvedValue({ horasBecaRequeridas: 40, horasExtensionRequeridas: 20 });
    prisma.horasParticipacion.aggregate
      .mockResolvedValueOnce({ _sum: { horasAprobadas: 12 } })
      .mockResolvedValueOnce({ _sum: { horasAprobadas: 5 } })
      .mockResolvedValueOnce({ _sum: { horasAprobadas: 7 } });
    prisma.participacionProyecto.count.mockResolvedValue(2);
    prisma.postulacion.findMany.mockResolvedValue([]);
    const service = new UsersService(prisma);

    const result = await service.getDashboard(1);

    expect(result.horasTotal).toBe(12);
    expect(result.horasBeca).toBe(5);
    expect(result.horasExtension).toBe(7);
  });

  // T-267: GET /usuarios/me/tareas no acepta ningún id externo (el DTO de
  // query no declara ese campo y el ValidationPipe global lo rechazaría);
  // esto verifica en el service, que es quien arma la consulta a Prisma,
  // que el filtro de asignación siempre usa el userId de la sesión.
  it('getMisTareas solo devuelve tareas asignadas al usuario de la sesión', async () => {
    const prisma = prismaMock();
    prisma.tarea.findMany.mockResolvedValue([]);
    const service = new UsersService(prisma);

    await service.getMisTareas(42, {});

    expect(prisma.tarea.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          asignaciones: { some: { idUsuario: 42 } },
        }),
      }),
    );
  });
});

// HU-158 (T-231): «Mis Horas» se delega entero al proveedor de horas.
describe('UsersService.getMisHoras', () => {
  const desglose = {
    idUsuario: 42,
    requisitos: { horasBecaRequeridas: 40, horasExtensionRequeridas: null },
    totales: {
      registradasEnProyectosAbiertos: '7.50',
      legacyEnProyectosAbiertos: '2.00',
      propuestasPendientes: '4.00',
      acreditadas: '6.00',
    },
    porTipo: [],
    proyectos: [],
  };
  const proveedor = () => ({
    forUserBreakdown: vi.fn().mockResolvedValue(desglose),
    forUserOpenProjects: vi.fn(),
  });

  it('delega exactamente el userId de la sesión y devuelve el desglose sin transformarlo', async () => {
    const prisma = prismaMock();
    const horas = proveedor();
    const service = new UsersService(prisma, horas as unknown as ProjectHoursSummaryService);

    await expect(service.getMisHoras(42)).resolves.toBe(desglose);
    expect(horas.forUserBreakdown).toHaveBeenCalledTimes(1);
    expect(horas.forUserBreakdown).toHaveBeenCalledWith(42);
    expect(horas.forUserOpenProjects).not.toHaveBeenCalled();
  });

  it('no consulta Prisma: la contabilidad vive solo en el proveedor de horas', async () => {
    const prisma = prismaMock();
    const service = new UsersService(prisma, proveedor() as unknown as ProjectHoursSummaryService);

    await service.getMisHoras(42);

    for (const [modelo, delegado] of Object.entries(prisma)) {
      if (typeof delegado === 'function') {
        expect(delegado, modelo).not.toHaveBeenCalled();
        continue;
      }
      for (const [metodo, fn] of Object.entries(delegado as Record<string, ReturnType<typeof vi.fn>>)) {
        expect(fn, `${modelo}.${metodo}`).not.toHaveBeenCalled();
      }
    }
  });

  it('sin proveedor de horas responde 500 explícito en lugar de ceros engañosos', async () => {
    const service = new UsersService(prismaMock());

    await expect(service.getMisHoras(42)).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('el dashboard sigue usando forUserOpenProjects y conserva exactamente su forma de respuesta', async () => {
    const prisma = prismaMock();
    prisma.perfilEstudiante.findUnique.mockResolvedValue({ horasBecaRequeridas: 40, horasExtensionRequeridas: 20 });
    prisma.horasParticipacion.aggregate
      .mockResolvedValueOnce({ _sum: { horasAprobadas: 12 } })
      .mockResolvedValueOnce({ _sum: { horasAprobadas: 5 } })
      .mockResolvedValueOnce({ _sum: { horasAprobadas: 7 } });
    prisma.participacionProyecto.count.mockResolvedValue(2);
    prisma.postulacion.findMany.mockResolvedValue([]);
    const horas = proveedor();
    horas.forUserOpenProjects.mockResolvedValue({
      idUsuario: 1,
      reportadasGranulares: '7.50',
      legacy: '2.00',
      acreditadas: '12.00',
      proyectos: [],
    });
    const service = new UsersService(prisma, horas as unknown as ProjectHoursSummaryService);

    const dashboard = await service.getDashboard(1);

    expect(dashboard).toEqual({
      horasBeca: 5,
      horasBecaRequeridas: 40,
      horasExtension: 7,
      horasExtensionRequeridas: 20,
      horasTotal: 12,
      proyectosActivos: 2,
      postulacionesRecientes: [],
      horasRegistradasEnProyectosAbiertos: '7.50',
      horasAcreditadas: '12.00',
    });
    expect(horas.forUserOpenProjects).toHaveBeenCalledWith(1);
    expect(horas.forUserBreakdown).not.toHaveBeenCalled();
  });
});
