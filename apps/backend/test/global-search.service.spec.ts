import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { GlobalSearchService } from '../src/search/global-search.service';
import type { UserNameSearchService } from '../src/common/search/user-name-search.service';
import type { ChatService } from '../src/chat/chat.service';
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

function makeChat(conversaciones: unknown[] = []) {
  return { listAllConversations: vi.fn().mockResolvedValue(conversaciones) } as unknown as ChatService & {
    listAllConversations: ReturnType<typeof vi.fn>;
  };
}

describe('GlobalSearchService.buscarProyectos', () => {
  it('resuelve ids por SQL crudo y luego hidrata solo proyectos visibles', async () => {
    const prisma = makePrisma();
    prisma.$queryRaw.mockResolvedValueOnce([{ id_proyecto: 1 }, { id_proyecto: 2 }]);
    prisma.proyecto.findMany.mockResolvedValueOnce([
      { idProyecto: 1, tituloProyecto: 'Móvil UVG', tipoProyecto: 'SOCIAL', modalidadProyecto: 'MIXTA' },
    ]);
    const service = new GlobalSearchService(prisma, makeUserNameSearch(), makeChat());

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
    const service = new GlobalSearchService(prisma, makeUserNameSearch(), makeChat());

    const resultado = await service.buscarProyectos('proyecto');

    expect(resultado.items).toHaveLength(5);
    expect(resultado.hasMore).toBe(true);
  });

  it('escapa los comodines de LIKE en el texto de busqueda', async () => {
    const prisma = makePrisma();
    const service = new GlobalSearchService(prisma, makeUserNameSearch(), makeChat());

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
    const service = new GlobalSearchService(prisma, userNameSearch, makeChat());

    const resultado = await service.buscarPersonas('saul');

    expect(userNameSearch.findMatchingUserIds).toHaveBeenCalledWith('saul');
    expect(prisma.usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          idUsuario: { in: [9, 42] },
          rolesAcceso: { none: { rolAcceso: { nombrePerfil: 'administrador' } } },
          estado: 'ACTIVO',
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
    const service = new GlobalSearchService(prisma, userNameSearch, makeChat());

    const resultado = await service.buscarPersonas('zzz-no-existe');

    expect(resultado).toEqual({ items: [], hasMore: false });
  });
});

describe('GlobalSearchService.buscarTareas', () => {
  it('excluye tareas de proyectos CANCELADO, aunque el usuario sea lider o participante activo', async () => {
    const prisma = makePrisma();
    const service = new GlobalSearchService(prisma, makeUserNameSearch(), makeChat());

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
    const service = new GlobalSearchService(prisma, makeUserNameSearch(), makeChat());

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
    const service = new GlobalSearchService(prisma, makeUserNameSearch(), makeChat());

    const resultado = await service.buscarTareas('cualquier-cosa', 1);

    expect(resultado).toEqual({ items: [], hasMore: false });
  });
});

describe('GlobalSearchService.buscar', () => {
  it('query vacia devuelve estructura vacia sin tocar la base de datos', async () => {
    const prisma = makePrisma();
    const userNameSearch = makeUserNameSearch();
    const service = new GlobalSearchService(prisma, userNameSearch, makeChat());

    const resultado = await service.buscar(1, '   ');

    expect(resultado).toEqual({
      proyectos: { items: [], hasMore: false },
      personas: { items: [], hasMore: false },
      tareas: { items: [], hasMore: false },
      mensajes: { items: [], hasMore: false },
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
    const service = new GlobalSearchService(prisma, userNameSearch, makeChat());

    const resultado = await service.buscar(1, 'react');

    expect(resultado).toEqual({
      proyectos: { items: [], hasMore: false },
      personas: { items: [], hasMore: false },
      tareas: { items: [], hasMore: false },
      mensajes: { items: [], hasMore: false },
    });
  });

  it('rechaza un texto de un solo caracter sin tocar la base de datos', async () => {
    const prisma = makePrisma();
    const userNameSearch = makeUserNameSearch();
    const service = new GlobalSearchService(prisma, userNameSearch, makeChat());

    await expect(service.buscar(1, 'a')).rejects.toThrow(BadRequestException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(userNameSearch.findMatchingUserIds).not.toHaveBeenCalled();
  });
});

describe('GlobalSearchService.buscarMensajes', () => {
  it('reutiliza ChatService.listAllConversations (misma busqueda que /dashboard/mensajes) con el usuario y el texto', async () => {
    const chat = makeChat([
      {
        idConversacion: 9,
        esCanal: true,
        nombre: 'Demo - Hackathon de Computacion',
        nombrePersonalizado: null,
        tipo: 'GRUPAL',
        proyecto: { tituloProyecto: 'Hackathon' },
        participantes: [],
      },
      {
        idConversacion: 10,
        esCanal: false,
        nombre: null,
        nombrePersonalizado: null,
        tipo: 'INDIVIDUAL',
        proyecto: { tituloProyecto: 'Hackathon' },
        participantes: [
          { idUsuario: 1, nombre: 'Yo', apellido: 'Mismo', apodo: null },
          { idUsuario: 2, nombre: 'Ana', apellido: 'Lopez', apodo: null },
        ],
      },
    ]);
    const service = new GlobalSearchService(makePrisma(), makeUserNameSearch(), chat);

    const resultado = await service.buscarMensajes('patrocinadores', 1);

    expect(chat.listAllConversations).toHaveBeenCalledWith(1, 'patrocinadores', 6);
    expect(resultado).toEqual({
      items: [
        { idConversacion: 9, nombre: '#Demo - Hackathon de Computacion', esCanal: true, tituloProyecto: 'Hackathon' },
        { idConversacion: 10, nombre: 'Ana Lopez', esCanal: false, tituloProyecto: 'Hackathon' },
      ],
      hasMore: false,
    });
  });

  it('recorta a 5 y marca hasMore', async () => {
    const seis = Array.from({ length: 6 }, (_, i) => ({
      idConversacion: i + 1,
      esCanal: true,
      nombre: `c${i}`,
      nombrePersonalizado: null,
      tipo: 'GRUPAL',
      proyecto: { tituloProyecto: 'P' },
      participantes: [],
    }));
    const service = new GlobalSearchService(makePrisma(), makeUserNameSearch(), makeChat(seis));

    const resultado = await service.buscarMensajes('c', 1);

    expect(resultado.items).toHaveLength(5);
    expect(resultado.hasMore).toBe(true);
  });

  it('buscar() incluye el grupo mensajes', async () => {
    const chat = makeChat([
      { idConversacion: 3, esCanal: true, nombre: 'general', nombrePersonalizado: null, tipo: 'GRUPAL', proyecto: { tituloProyecto: 'P' }, participantes: [] },
    ]);
    const service = new GlobalSearchService(makePrisma(), makeUserNameSearch(), chat);

    const resultado = await service.buscar(1, 'general');

    expect(resultado.mensajes.items).toEqual([{ idConversacion: 3, nombre: '#general', esCanal: true, tituloProyecto: 'P' }]);
  });
});
