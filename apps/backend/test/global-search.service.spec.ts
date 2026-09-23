import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { GlobalSearchService } from '../src/search/global-search.service';
import type { UserNameSearchService } from '../src/common/search/user-name-search.service';
import type { PrismaService } from '../src/prisma/prisma.service';

function makePrisma(overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    proyecto: { findMany: vi.fn().mockResolvedValue([]) },
    usuario: { findMany: vi.fn().mockResolvedValue([]) },
    tarea: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as PrismaService & {
    $queryRaw: ReturnType<typeof vi.fn>;
    proyecto: { findMany: ReturnType<typeof vi.fn> };
    usuario: { findMany: ReturnType<typeof vi.fn> };
    tarea: { findMany: ReturnType<typeof vi.fn> };
  };
}

function makeUserNameSearch() {
  return { findMatchingUserIds: vi.fn().mockResolvedValue([]) } as unknown as UserNameSearchService & {
    findMatchingUserIds: ReturnType<typeof vi.fn>;
  };
}

describe('GlobalSearchService.buscarProyectos', () => {
  it('resuelve ids por SQL crudo y luego hidrata solo proyectos visibles', async () => {
    const prisma = makePrisma();
    prisma.$queryRaw.mockResolvedValueOnce([{ id_proyecto: 1 }, { id_proyecto: 2 }]);
    prisma.proyecto.findMany.mockResolvedValueOnce([
      { idProyecto: 1, tituloProyecto: 'Móvil UVG', tipoProyecto: 'SOCIAL', modalidadProyecto: 'MIXTA' },
    ]);
    const service = new GlobalSearchService(prisma, makeUserNameSearch());

    const resultado = await service.buscarProyectos('movil');

    expect(prisma.proyecto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ idProyecto: { in: [1, 2] } }),
      }),
    );
    expect(resultado).toEqual({
      items: [{ idProyecto: 1, tituloProyecto: 'Móvil UVG', tipoProyecto: 'SOCIAL', modalidadProyecto: 'MIXTA' }],
      hasMore: false,
    });
  });

  it('marca hasMore cuando hay más de 5 coincidencias y recorta a 5', async () => {
    const prisma = makePrisma();
    const seisFilas = Array.from({ length: 6 }, (_, i) => ({
      idProyecto: i + 1,
      tituloProyecto: `Proyecto ${i + 1}`,
      tipoProyecto: 'SOCIAL',
      modalidadProyecto: 'MIXTA',
    }));
    prisma.$queryRaw.mockResolvedValueOnce(seisFilas.map((f) => ({ id_proyecto: f.idProyecto })));
    prisma.proyecto.findMany.mockResolvedValueOnce(seisFilas);
    const service = new GlobalSearchService(prisma, makeUserNameSearch());

    const resultado = await service.buscarProyectos('proyecto');

    expect(resultado.items).toHaveLength(5);
    expect(resultado.hasMore).toBe(true);
  });

  it('escapa los comodines de LIKE en el texto de busqueda', async () => {
    const prisma = makePrisma();
    const service = new GlobalSearchService(prisma, makeUserNameSearch());

    await service.buscarProyectos('50%_raro\\');

    const sql = prisma.$queryRaw.mock.calls[0][0];
    expect(sql.values).toEqual(['%50\\%\\_raro\\\\%']);
  });
});

describe('GlobalSearchService.buscarPersonas', () => {
  it('reutiliza UserNameSearchService.findMatchingUserIds y excluye administradores', async () => {
    const prisma = makePrisma();
    const userNameSearch = makeUserNameSearch();
    userNameSearch.findMatchingUserIds.mockResolvedValueOnce([9, 42]);
    prisma.usuario.findMany.mockResolvedValueOnce([
      { idUsuario: 9, nombre: 'Saúl', apellido: 'Castillo', fotoUrl: null, perfil: { carrera: { nombreCarrera: 'Ing.' } } },
    ]);
    const service = new GlobalSearchService(prisma, userNameSearch);

    const resultado = await service.buscarPersonas('saul');

    expect(userNameSearch.findMatchingUserIds).toHaveBeenCalledWith('saul');
    expect(prisma.usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          idUsuario: { in: [9, 42] },
          rolesAcceso: { none: { rolAcceso: { nombrePerfil: 'administrador' } } },
        }),
      }),
    );
    expect(resultado.items).toEqual([
      { idUsuario: 9, nombre: 'Saúl', apellido: 'Castillo', fotoUrl: null, carrera: 'Ing.' },
    ]);
  });

  it('sin coincidencias, no llama a usuario.findMany con lista vacia y devuelve estructura vacia', async () => {
    const prisma = makePrisma();
    const userNameSearch = makeUserNameSearch();
    userNameSearch.findMatchingUserIds.mockResolvedValueOnce([]);
    prisma.usuario.findMany.mockResolvedValueOnce([]);
    const service = new GlobalSearchService(prisma, userNameSearch);

    const resultado = await service.buscarPersonas('zzz-no-existe');

    expect(resultado).toEqual({ items: [], hasMore: false });
  });
});

describe('GlobalSearchService.buscarTareas', () => {
  it('excluye tareas de proyectos CANCELADO, aunque el usuario sea lider o participante activo', async () => {
    const prisma = makePrisma();
    const service = new GlobalSearchService(prisma, makeUserNameSearch());

    await service.buscarTareas('login', 99);

    expect(prisma.tarea.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          proyecto: expect.objectContaining({
            estadoProyecto: { not: 'CANCELADO' },
          }),
        }),
      }),
    );
  });

  it('filtra por proyectos donde el usuario es lider o participante activo', async () => {
    const prisma = makePrisma();
    prisma.$queryRaw.mockResolvedValueOnce([{ id_tarea: 1 }]);
    prisma.tarea.findMany.mockResolvedValueOnce([
      {
        idTarea: 1,
        tituloTarea: 'Diseñar login',
        idProyecto: 7,
        estadoTarea: 'POR_HACER',
        proyecto: { tituloProyecto: 'App móvil' },
      },
    ]);
    const service = new GlobalSearchService(prisma, makeUserNameSearch());

    const resultado = await service.buscarTareas('login', 99);

    expect(prisma.tarea.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          idTarea: { in: [1] },
          eliminadoEn: null,
          proyecto: expect.objectContaining({
            OR: [
              { creadoPor: 99 },
              {
                roles: {
                  some: {
                    participaciones: {
                      some: { idUsuario: 99, estadoParticipacion: 'ACTIVO' },
                    },
                  },
                },
              },
            ],
          }),
        }),
      }),
    );
    expect(resultado.items).toEqual([
      { idTarea: 1, tituloTarea: 'Diseñar login', idProyecto: 7, tituloProyecto: 'App móvil', estadoTarea: 'POR_HACER' },
    ]);
  });

  it('sin proyectos propios, no lanza y devuelve items vacios', async () => {
    const prisma = makePrisma();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    prisma.tarea.findMany.mockResolvedValueOnce([]);
    const service = new GlobalSearchService(prisma, makeUserNameSearch());

    const resultado = await service.buscarTareas('cualquier-cosa', 1);

    expect(resultado).toEqual({ items: [], hasMore: false });
  });
});

describe('GlobalSearchService.buscar', () => {
  it('query vacia devuelve estructura vacia sin tocar la base de datos', async () => {
    const prisma = makePrisma();
    const userNameSearch = makeUserNameSearch();
    const service = new GlobalSearchService(prisma, userNameSearch);

    const resultado = await service.buscar(1, '   ');

    expect(resultado).toEqual({
      proyectos: { items: [], hasMore: false },
      personas: { items: [], hasMore: false },
      tareas: { items: [], hasMore: false },
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.proyecto.findMany).not.toHaveBeenCalled();
    expect(userNameSearch.findMatchingUserIds).not.toHaveBeenCalled();
  });

  it('agrupa proyectos, personas y tareas en una sola respuesta', async () => {
    const prisma = makePrisma();
    const userNameSearch = makeUserNameSearch();
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.proyecto.findMany.mockResolvedValueOnce([]);
    prisma.tarea.findMany.mockResolvedValueOnce([]);
    userNameSearch.findMatchingUserIds.mockResolvedValueOnce([]);
    prisma.usuario.findMany.mockResolvedValueOnce([]);
    const service = new GlobalSearchService(prisma, userNameSearch);

    const resultado = await service.buscar(1, 'react');

    expect(resultado).toEqual({
      proyectos: { items: [], hasMore: false },
      personas: { items: [], hasMore: false },
      tareas: { items: [], hasMore: false },
    });
  });

  it('rechaza un texto de un solo caracter sin tocar la base de datos', async () => {
    const prisma = makePrisma();
    const userNameSearch = makeUserNameSearch();
    const service = new GlobalSearchService(prisma, userNameSearch);

    await expect(service.buscar(1, 'a')).rejects.toThrow(BadRequestException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(userNameSearch.findMatchingUserIds).not.toHaveBeenCalled();
  });
});
