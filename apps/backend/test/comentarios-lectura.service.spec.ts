import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ComentariosService } from '../src/comentarios/comentarios.service';

function makePrisma() {
  return {
    comentario: { findMany: vi.fn() },
    proyecto: { findUnique: vi.fn() },
    hito: { findUnique: vi.fn() },
    participacionProyecto: { findFirst: vi.fn() },
  } as any;
}

const AUTOR_SELECT = {
  select: { idUsuario: true, nombre: true, apellido: true, fotoUrl: true },
} as const;

const ID_PROYECTO = 10;
const OTRO_PROYECTO_ID = 77;
const LIDER_ID = 1;
const PARTICIPANTE_ACTIVO_ID = 2;
const EXTERNO_ID = 99;

describe('ComentariosService - autorización de lectura de comentarios', () => {
  describe('findByProyecto', () => {
    it('permite leer al líder real del proyecto y conserva filtro/include/orden', async () => {
      const prisma = makePrisma();
      prisma.proyecto.findUnique.mockResolvedValue({ creadoPor: LIDER_ID });
      prisma.comentario.findMany.mockResolvedValue([{ idComentario: 1 }]);
      const service = new ComentariosService(prisma, {} as any);

      const result = await service.findByProyecto(ID_PROYECTO, LIDER_ID);

      expect(result).toEqual([{ idComentario: 1 }]);
      expect(prisma.participacionProyecto.findFirst).not.toHaveBeenCalled();
      expect(prisma.comentario.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.comentario.findMany).toHaveBeenCalledWith({
        where: { idProyecto: ID_PROYECTO, eliminadoEn: null },
        include: { autor: AUTOR_SELECT },
        orderBy: { creadoEn: 'asc' },
      });
    });

    it('permite leer a un participante con estadoParticipacion ACTIVO', async () => {
      const prisma = makePrisma();
      prisma.proyecto.findUnique.mockResolvedValue({ creadoPor: LIDER_ID });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 5 });
      prisma.comentario.findMany.mockResolvedValue([]);
      const service = new ComentariosService(prisma, {} as any);

      await service.findByProyecto(ID_PROYECTO, PARTICIPANTE_ACTIVO_ID);

      expect(prisma.participacionProyecto.findFirst).toHaveBeenCalledWith({
        where: {
          idUsuario: PARTICIPANTE_ACTIVO_ID,
          estadoParticipacion: 'ACTIVO',
          rolProyecto: { idProyecto: ID_PROYECTO },
        },
        select: { idParticipacion: true },
      });
      expect(prisma.comentario.findMany).toHaveBeenCalledTimes(1);
    });

    it('rechaza a un usuario externo con ForbiddenException y no devuelve lista vacía', async () => {
      const prisma = makePrisma();
      prisma.proyecto.findUnique.mockResolvedValue({ creadoPor: LIDER_ID });
      prisma.participacionProyecto.findFirst.mockResolvedValue(null);
      const service = new ComentariosService(prisma, {} as any);

      await expect(service.findByProyecto(ID_PROYECTO, EXTERNO_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.comentario.findMany).not.toHaveBeenCalled();
    });

    it.each([
      ['RETIRADO', 3],
      ['COMPLETADO', 4],
    ])(
      'rechaza a un participante con estadoParticipacion %s (no activo)',
      async (_estado, userId) => {
        const prisma = makePrisma();
        prisma.proyecto.findUnique.mockResolvedValue({ creadoPor: LIDER_ID });
        prisma.participacionProyecto.findFirst.mockResolvedValue(null);
        const service = new ComentariosService(prisma, {} as any);

        await expect(service.findByProyecto(ID_PROYECTO, userId)).rejects.toBeInstanceOf(
          ForbiddenException,
        );
        expect(prisma.participacionProyecto.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ estadoParticipacion: 'ACTIVO' }),
          }),
        );
        expect(prisma.comentario.findMany).not.toHaveBeenCalled();
      },
    );

    it('lanza NotFoundException si el proyecto no existe y no consulta participación ni comentarios', async () => {
      const prisma = makePrisma();
      prisma.proyecto.findUnique.mockResolvedValue(null);
      const service = new ComentariosService(prisma, {} as any);

      await expect(service.findByProyecto(999, LIDER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.participacionProyecto.findFirst).not.toHaveBeenCalled();
      expect(prisma.comentario.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findByHito', () => {
    const ID_HITO = 30;

    it('permite leer al líder y conserva filtro/include/orden', async () => {
      const prisma = makePrisma();
      prisma.hito.findUnique.mockResolvedValue({ idProyecto: ID_PROYECTO });
      prisma.proyecto.findUnique.mockResolvedValue({ creadoPor: LIDER_ID });
      prisma.comentario.findMany.mockResolvedValue([{ idComentario: 4 }]);
      const service = new ComentariosService(prisma, {} as any);

      const result = await service.findByHito(ID_HITO, LIDER_ID);

      expect(result).toEqual([{ idComentario: 4 }]);
      expect(prisma.comentario.findMany).toHaveBeenCalledWith({
        where: { idHito: ID_HITO, eliminadoEn: null },
        include: { autor: AUTOR_SELECT },
        orderBy: { creadoEn: 'asc' },
      });
    });

    it('permite leer a un participante activo del proyecto real del hito', async () => {
      const prisma = makePrisma();
      prisma.hito.findUnique.mockResolvedValue({ idProyecto: ID_PROYECTO });
      prisma.proyecto.findUnique.mockResolvedValue({ creadoPor: LIDER_ID });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      prisma.comentario.findMany.mockResolvedValue([]);
      const service = new ComentariosService(prisma, {} as any);

      await service.findByHito(ID_HITO, PARTICIPANTE_ACTIVO_ID);

      expect(prisma.comentario.findMany).toHaveBeenCalledTimes(1);
    });

    it('rechaza a un usuario externo', async () => {
      const prisma = makePrisma();
      prisma.hito.findUnique.mockResolvedValue({ idProyecto: ID_PROYECTO });
      prisma.proyecto.findUnique.mockResolvedValue({ creadoPor: LIDER_ID });
      prisma.participacionProyecto.findFirst.mockResolvedValue(null);
      const service = new ComentariosService(prisma, {} as any);

      await expect(service.findByHito(ID_HITO, EXTERNO_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.comentario.findMany).not.toHaveBeenCalled();
    });

    it('rechaza a un participante RETIRADO', async () => {
      const prisma = makePrisma();
      prisma.hito.findUnique.mockResolvedValue({ idProyecto: ID_PROYECTO });
      prisma.proyecto.findUnique.mockResolvedValue({ creadoPor: LIDER_ID });
      prisma.participacionProyecto.findFirst.mockResolvedValue(null);
      const service = new ComentariosService(prisma, {} as any);

      await expect(service.findByHito(ID_HITO, 3)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.comentario.findMany).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si el hito no existe y no continúa con la autorización', async () => {
      const prisma = makePrisma();
      prisma.hito.findUnique.mockResolvedValue(null);
      const service = new ComentariosService(prisma, {} as any);

      await expect(service.findByHito(999, LIDER_ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.proyecto.findUnique).not.toHaveBeenCalled();
      expect(prisma.comentario.findMany).not.toHaveBeenCalled();
    });

    it('autoriza usando el idProyecto real obtenido del hito, no uno externo', async () => {
      const prisma = makePrisma();
      prisma.hito.findUnique.mockResolvedValue({ idProyecto: OTRO_PROYECTO_ID });
      prisma.proyecto.findUnique.mockResolvedValue({ creadoPor: LIDER_ID });
      prisma.comentario.findMany.mockResolvedValue([]);
      const service = new ComentariosService(prisma, {} as any);

      await service.findByHito(ID_HITO, LIDER_ID);

      expect(prisma.hito.findUnique).toHaveBeenCalledWith({
        where: { idHito: ID_HITO },
        select: { idProyecto: true },
      });
      expect(prisma.proyecto.findUnique).toHaveBeenCalledWith({
        where: { idProyecto: OTRO_PROYECTO_ID },
        select: { creadoPor: true },
      });
    });

    it('rechaza a un participante activo de otro proyecto cuando el hito pertenece a un proyecto distinto', async () => {
      const prisma = makePrisma();
      prisma.hito.findUnique.mockResolvedValue({ idProyecto: OTRO_PROYECTO_ID });
      prisma.proyecto.findUnique.mockResolvedValue({ creadoPor: 555 });
      prisma.participacionProyecto.findFirst.mockResolvedValue(null);
      const service = new ComentariosService(prisma, {} as any);

      await expect(
        service.findByHito(ID_HITO, PARTICIPANTE_ACTIVO_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.participacionProyecto.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ rolProyecto: { idProyecto: OTRO_PROYECTO_ID } }),
        }),
      );
      expect(prisma.comentario.findMany).not.toHaveBeenCalled();
    });
  });
});
