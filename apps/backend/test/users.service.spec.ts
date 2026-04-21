import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { UsersService } from '../src/users/users.service';

function prismaMock() {
  return {
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
    $transaction: vi.fn(async (cb: (tx: any) => unknown) => cb({
      usuario: { update: vi.fn() },
      perfilEstudiante: { update: vi.fn() },
      usuarioHabilidad: { deleteMany: vi.fn(), createMany: vi.fn() },
      usuarioInteres: { deleteMany: vi.fn(), createMany: vi.fn() },
      usuarioCualidad: { deleteMany: vi.fn(), createMany: vi.fn() },
    })),
  } as any;
}

describe('UsersService', () => {
  it('getMe retorna usuario', async () => {
    const prisma = prismaMock();
    prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 1 });
    const service = new UsersService(prisma);
    await expect(service.getMe(1)).resolves.toEqual({ idUsuario: 1 });
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
    prisma.$transaction = vi.fn(async (cb: (arg: any) => unknown) => cb(tx));
    prisma.usuario.findUnique.mockResolvedValue({ idUsuario: 1 });
    const service = new UsersService(prisma);
    const getProfileSpy = vi.spyOn(service, 'getProfile').mockResolvedValue({ ok: true } as any);

    const result = await service.updateProfile(1, { nombreCompleto: 'Ana Perez', biografia: 'x' });

    expect(tx.usuario.update).toHaveBeenCalled();
    expect(tx.perfilEstudiante.update).toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
    getProfileSpy.mockRestore();
  });

  it('replaceIntereses reemplaza y retorna count', async () => {
    const prisma = prismaMock();
    const tx = { usuarioInteres: { deleteMany: vi.fn(), createMany: vi.fn() } };
    prisma.$transaction = vi.fn(async (cb: (arg: any) => unknown) => cb(tx));
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
});
