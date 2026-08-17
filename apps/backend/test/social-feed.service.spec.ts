import { describe, expect, it, vi } from 'vitest';
import { SocialFeedService } from '../src/social/social-feed.service';

function makePrisma(nombresPerfil: string[]) {
  return {
    usuarioRolAcceso: {
      findMany: vi.fn().mockResolvedValue(nombresPerfil.map((nombrePerfil) => ({ rolAcceso: { nombrePerfil } }))),
    },
    proyecto: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

function makeSocial(amigoIds: number[] = [], seguidoIds: number[] = []) {
  return {
    getAmigoIds: vi.fn().mockResolvedValue(amigoIds),
    getSeguidoIds: vi.fn().mockResolvedValue(seguidoIds),
  };
}

describe('SocialFeedService', () => {
  it('admin: ambas secciones vacías sin consultar proyectos', async () => {
    const prisma = makePrisma(['administrador']);
    const social = makeSocial([1, 2], [3]);
    const service = new SocialFeedService(prisma as any, social as any);

    const feed = await service.getFeed(10);

    expect(feed).toEqual({ proyectosDeAmigos: [], proyectosDeSeguidos: [] });
    expect(prisma.proyecto.findMany).not.toHaveBeenCalled();
  });

  it('estudiante: consulta ambas secciones sin excluir proyectos propios', async () => {
    const prisma = makePrisma(['estudiante']);
    const social = makeSocial([1], [2]);
    const service = new SocialFeedService(prisma as any, social as any);

    await service.getFeed(10);

    expect(prisma.proyecto.findMany).toHaveBeenCalledTimes(2);
    const [amigosArgs, seguidosArgs] = prisma.proyecto.findMany.mock.calls.map((c) => c[0]);
    expect(amigosArgs.where.creadoPor).toBeUndefined();
    expect(seguidosArgs.where.creadoPor).toBeUndefined();
  });

  it('lider_asociacion: excluye sus propios proyectos en ambas secciones', async () => {
    const prisma = makePrisma(['lider_asociacion']);
    const social = makeSocial([1], [2]);
    const service = new SocialFeedService(prisma as any, social as any);

    await service.getFeed(10);

    const [amigosArgs, seguidosArgs] = prisma.proyecto.findMany.mock.calls.map((c) => c[0]);
    expect(amigosArgs.where.creadoPor).toEqual({ not: 10 });
    expect(seguidosArgs.where.creadoPor).toEqual({ not: 10 });
  });

  it('excluye de "seguidos" los proyectos ya listados en "amigos"', async () => {
    const prisma = makePrisma(['estudiante']);
    prisma.proyecto.findMany.mockResolvedValueOnce([
      {
        idProyecto: 1,
        tituloProyecto: 'A',
        estadoProyecto: 'PUBLICADO',
        creadoPor: 5,
        creador: { idUsuario: 5, nombre: 'X', apellido: 'Y', fotoUrl: null },
        roles: [],
      },
    ]);
    prisma.proyecto.findMany.mockResolvedValueOnce([]);
    const social = makeSocial([1], [2]);
    const service = new SocialFeedService(prisma as any, social as any);

    await service.getFeed(10);

    const seguidosArgs = prisma.proyecto.findMany.mock.calls[1][0];
    expect(seguidosArgs.where.idProyecto).toEqual({ notIn: [1] });
  });

  it('no consulta proyectos si la persona no tiene amigos ni seguidos', async () => {
    const prisma = makePrisma(['estudiante']);
    const social = makeSocial([], []);
    const service = new SocialFeedService(prisma as any, social as any);

    const feed = await service.getFeed(10);

    expect(feed).toEqual({ proyectosDeAmigos: [], proyectosDeSeguidos: [] });
    expect(prisma.proyecto.findMany).not.toHaveBeenCalled();
  });

  it('limita a 3 los avatares de amigos participantes por proyecto', async () => {
    const prisma = makePrisma(['estudiante']);
    const participaciones = [1, 2, 3, 4].map((idUsuario) => ({
      idUsuario,
      usuario: { idUsuario, nombre: `U${idUsuario}`, apellido: '', fotoUrl: null },
    }));
    prisma.proyecto.findMany.mockResolvedValueOnce([
      {
        idProyecto: 1,
        tituloProyecto: 'A',
        estadoProyecto: 'PUBLICADO',
        creadoPor: 999,
        creador: { idUsuario: 999, nombre: 'Z', apellido: '', fotoUrl: null },
        roles: [{ participaciones }],
      },
    ]);
    prisma.proyecto.findMany.mockResolvedValueOnce([]);
    const social = makeSocial([1, 2, 3, 4], []);
    const service = new SocialFeedService(prisma as any, social as any);

    const feed = await service.getFeed(10);

    expect(feed.proyectosDeAmigos[0].amigosParticipantes).toHaveLength(3);
  });
});
