import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DisponibilidadSemanalService } from '../src/perfil-portafolio/disponibilidad-semanal.service';

function build() {
  const prisma = {
    usuario: { findFirst: vi.fn().mockResolvedValue({ idUsuario: 2 }) },
    disponibilidadSemanal: {
      findMany: vi.fn().mockResolvedValue([{ diaSemana: 0, hora: 9 }, { diaSemana: 2, hora: 14 }]),
      deleteMany: vi.fn().mockReturnValue('borrar'),
      createMany: vi.fn().mockReturnValue('crear'),
    },
    $transaction: vi.fn().mockResolvedValue([]),
  };
  return { prisma, service: new DisponibilidadSemanalService(prisma as never) };
}

describe('DisponibilidadSemanalService', () => {
  it('bloquesDe devuelve {dia, hora} ordenados (contrato para el asistente de reuniones)', async () => {
    const { prisma, service } = build();
    await expect(service.bloquesDe(2)).resolves.toEqual([{ dia: 0, hora: 9 }, { dia: 2, hora: 14 }]);
    expect(prisma.disponibilidadSemanal.findMany.mock.calls[0][0].orderBy).toEqual([{ diaSemana: 'asc' }, { hora: 'asc' }]);
  });

  it('obtener declara la zona horaria de Guatemala', async () => {
    const { service } = build();
    await expect(service.obtener(1, 2)).resolves.toMatchObject({ zonaHoraria: 'America/Guatemala' });
  });

  it('obtener respeta la privacidad del directorio: 404 si la persona no es visible', async () => {
    const { prisma, service } = build();
    prisma.usuario.findFirst.mockResolvedValue(null);
    await expect(service.obtener(1, 2)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.disponibilidadSemanal.findMany).not.toHaveBeenCalled();
  });

  it('la propia persona siempre se ve a si misma sin consultar el directorio', async () => {
    const { prisma, service } = build();
    await service.obtener(2, 2);
    expect(prisma.usuario.findFirst).not.toHaveBeenCalled();
  });

  it('reemplazar escribe solo para el usuario recibido y sin duplicar bloques', async () => {
    const { prisma, service } = build();
    await service.reemplazar(7, [{ dia: 1, hora: 8 }, { dia: 1, hora: 8 }, { dia: 6, hora: 23 }]);
    expect(prisma.disponibilidadSemanal.deleteMany).toHaveBeenCalledWith({ where: { idUsuario: 7 } });
    expect(prisma.disponibilidadSemanal.createMany).toHaveBeenCalledWith({
      data: [{ idUsuario: 7, diaSemana: 1, hora: 8 }, { idUsuario: 7, diaSemana: 6, hora: 23 }],
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(['borrar', 'crear']);
  });
});
