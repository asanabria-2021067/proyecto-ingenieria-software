import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TeamService } from '../src/team/team.service';

function makePrisma() {
  return {
    proyecto: { findFirst: vi.fn() },
    usuario: { findUnique: vi.fn() },
    participacionProyecto: { findMany: vi.fn() },
    asignacionTarea: { findMany: vi.fn().mockResolvedValue([]) },
    tarea: { findMany: vi.fn() },
    horasParticipacion: { findMany: vi.fn() },
  } as any;
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new TeamService(prisma, { findAll: vi.fn() } as any);
}

const LIDER = {
  idUsuario: 1,
  nombre: 'Lía',
  apellido: 'Der',
  correo: 'lider@example.com',
  fotoUrl: null,
};

function usuario(idUsuario: number, extra: Partial<typeof LIDER> = {}) {
  return {
    idUsuario,
    nombre: `Usuario${idUsuario}`,
    apellido: 'Apellido',
    correo: `usuario${idUsuario}@example.com`,
    fotoUrl: null,
    ...extra,
  };
}

function participacion(
  idUsuario: number,
  idRolProyecto: number,
  nombreRol = `Rol ${idRolProyecto}`,
  estadoParticipacion: 'ACTIVO' | 'RETIRADO' | 'COMPLETADO' = 'ACTIVO',
) {
  return {
    idUsuario,
    estadoParticipacion,
    usuario: usuario(idUsuario),
    rolProyecto: { idRolProyecto, nombreRol },
  };
}

// Decimal falso: replica la única API que el service consume (.toNumber()),
// igual que el patrón ya usado en projects-member-detail.service.spec.ts.
function decimal(value: number) {
  return { toNumber: () => value };
}

describe('TeamService.getTeamSummary', () => {
  // Caso 1 — líder válido
  it('devuelve lider y miembros cuando userId es el creador del proyecto', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 1 });
    prisma.usuario.findUnique.mockResolvedValue(LIDER);
    prisma.participacionProyecto.findMany.mockResolvedValue([]);
    const service = makeService(prisma);

    const resumen = await service.getTeamSummary(1, 1);

    expect(resumen.lider).toEqual(LIDER);
    expect(resumen.miembros).toEqual([]);
    expect(prisma.proyecto.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { idProyecto: 1, eliminadoEn: null } }),
    );
    expect(prisma.usuario.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { idUsuario: 1 } }),
    );
  });

  // Caso 2 — usuario no líder
  it('rechaza con ForbiddenException a un usuario que no es el creador del proyecto', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 99 });
    const service = makeService(prisma);

    await expect(service.getTeamSummary(1, 1)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
    expect(prisma.participacionProyecto.findMany).not.toHaveBeenCalled();
  });

  // Caso 3 — proyecto inexistente o eliminado
  it('rechaza con NotFoundException cuando el proyecto no existe (o fue eliminado)', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(null);
    const service = makeService(prisma);

    await expect(service.getTeamSummary(999, 1)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
  });

  // Caso 4 — proyecto sin integrantes
  it('retorna miembros: [] sin consultar tareas ni horas cuando el proyecto no tiene participaciones ACTIVO', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 1 });
    prisma.usuario.findUnique.mockResolvedValue(LIDER);
    prisma.participacionProyecto.findMany.mockResolvedValue([]);
    const service = makeService(prisma);

    const resumen = await service.getTeamSummary(1, 1);

    expect(resumen).toEqual({ lider: LIDER, miembros: [] });
    expect(prisma.tarea.findMany).not.toHaveBeenCalled();
    expect(prisma.horasParticipacion.findMany).not.toHaveBeenCalled();
  });

  // Caso 5 — integrante con un rol
  it('un integrante con una sola participación ACTIVO produce 1 miembro con roles.length === 1', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 1 });
    prisma.usuario.findUnique.mockResolvedValue(LIDER);
    prisma.participacionProyecto.findMany.mockResolvedValue([participacion(2, 10, 'Desarrollador')]);
    prisma.tarea.findMany.mockResolvedValue([]);
    prisma.horasParticipacion.findMany.mockResolvedValue([]);
    const service = makeService(prisma);

    const resumen = await service.getTeamSummary(1, 1);

    expect(resumen.miembros).toHaveLength(1);
    expect(resumen.miembros[0].idUsuario).toBe(2);
    expect(resumen.miembros[0].grupo).toBe('ACTIVOS');
    expect(resumen.miembros[0].roles).toEqual([{ idRolProyecto: 10, nombreRol: 'Desarrollador' }]);
  });

  // Caso 6 — integrante con múltiples roles (CRÍTICO: person-centric)
  it('dos participaciones ACTIVO del mismo idUsuario con distinto rol producen 1 miembro con roles.length === 2', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 1 });
    prisma.usuario.findUnique.mockResolvedValue(LIDER);
    prisma.participacionProyecto.findMany.mockResolvedValue([
      participacion(2, 10, 'Desarrollador'),
      participacion(2, 11, 'QA'),
    ]);
    prisma.tarea.findMany.mockResolvedValue([]);
    prisma.horasParticipacion.findMany.mockResolvedValue([]);
    const service = makeService(prisma);

    const resumen = await service.getTeamSummary(1, 1);

    expect(resumen.miembros).toHaveLength(1);
    expect(resumen.miembros[0].idUsuario).toBe(2);
    expect(resumen.miembros[0].roles).toEqual([
      { idRolProyecto: 10, nombreRol: 'Desarrollador' },
      { idRolProyecto: 11, nombreRol: 'QA' },
    ]);
  });

  it('no duplica un rol si el resultado mockeado de Prisma contiene el mismo (idUsuario, idRolProyecto) repetido', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 1 });
    prisma.usuario.findUnique.mockResolvedValue(LIDER);
    prisma.participacionProyecto.findMany.mockResolvedValue([
      participacion(2, 10, 'Desarrollador'),
      participacion(2, 10, 'Desarrollador'),
    ]);
    prisma.tarea.findMany.mockResolvedValue([]);
    prisma.horasParticipacion.findMany.mockResolvedValue([]);
    const service = makeService(prisma);

    const resumen = await service.getTeamSummary(1, 1);

    expect(resumen.miembros).toHaveLength(1);
    expect(resumen.miembros[0].roles).toEqual([{ idRolProyecto: 10, nombreRol: 'Desarrollador' }]);
  });

  // Caso 7 — todas las participaciones del proyecto (asertando el argumento real de Prisma)
  it('consulta participaciones filtrando por rolProyecto.idProyecto y excluyendo al creador, sin filtrar solo ACTIVO', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 7, creadoPor: 1 });
    prisma.usuario.findUnique.mockResolvedValue(LIDER);
    prisma.participacionProyecto.findMany.mockResolvedValue([]);
    const service = makeService(prisma);

    await service.getTeamSummary(7, 1);

    expect(prisma.participacionProyecto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          rolProyecto: { idProyecto: 7 },
          idUsuario: { not: 1 },
        },
      }),
    );
  });

  it('clasifica como RETIRADOS_CON_CONTRIBUCION cuando no hay participación ACTIVO y existe horasReales no null en el mismo proyecto', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 1 });
    prisma.usuario.findUnique.mockResolvedValue(LIDER);
    prisma.participacionProyecto.findMany.mockResolvedValue([
      participacion(2, 10, 'Desarrollador', 'RETIRADO'),
    ]);
    prisma.asignacionTarea.findMany.mockResolvedValue([{ idUsuario: 2 }]);
    prisma.tarea.findMany.mockResolvedValue([]);
    prisma.horasParticipacion.findMany.mockResolvedValue([]);
    const service = makeService(prisma);

    const resumen = await service.getTeamSummary(1, 1);

    expect(resumen.miembros).toHaveLength(1);
    expect(resumen.miembros[0].grupo).toBe('RETIRADOS_CON_CONTRIBUCION');
    expect(prisma.asignacionTarea.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          idUsuario: { in: [2] },
          horasReales: { not: null },
          tarea: { idProyecto: 1 },
        },
        distinct: ['idUsuario'],
      }),
    );
  });

  it('clasifica como RETIRADOS_SIN_CONTRIBUCION cuando no hay participación ACTIVO ni horasReales no null en el proyecto', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 1 });
    prisma.usuario.findUnique.mockResolvedValue(LIDER);
    prisma.participacionProyecto.findMany.mockResolvedValue([
      participacion(3, 10, 'QA', 'RETIRADO'),
    ]);
    prisma.asignacionTarea.findMany.mockResolvedValue([]);
    prisma.tarea.findMany.mockResolvedValue([]);
    prisma.horasParticipacion.findMany.mockResolvedValue([]);
    const service = makeService(prisma);

    const resumen = await service.getTeamSummary(1, 1);

    expect(resumen.miembros).toHaveLength(1);
    expect(resumen.miembros[0].grupo).toBe('RETIRADOS_SIN_CONTRIBUCION');
  });

  it('prioriza ACTIVOS en multirol mixto: una participación RETIRADO y otra ACTIVO aparecen como una sola persona activa', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 1 });
    prisma.usuario.findUnique.mockResolvedValue(LIDER);
    prisma.participacionProyecto.findMany.mockResolvedValue([
      participacion(4, 10, 'Diseñador', 'RETIRADO'),
      participacion(4, 11, 'QA', 'ACTIVO'),
    ]);
    prisma.asignacionTarea.findMany.mockResolvedValue([{ idUsuario: 4 }]);
    prisma.tarea.findMany.mockResolvedValue([]);
    prisma.horasParticipacion.findMany.mockResolvedValue([]);
    const service = makeService(prisma);

    const resumen = await service.getTeamSummary(1, 1);

    expect(resumen.miembros).toHaveLength(1);
    expect(resumen.miembros[0].grupo).toBe('ACTIVOS');
    expect(resumen.miembros[0].estadoParticipacion).toBe('ACTIVO');
    expect(resumen.miembros[0].roles).toEqual([
      { idRolProyecto: 10, nombreRol: 'Diseñador' },
      { idRolProyecto: 11, nombreRol: 'QA' },
    ]);
  });

  it('no deja que horasReales de otro proyecto clasifiquen como contribuyente al retirado del proyecto consultado', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 1 });
    prisma.usuario.findUnique.mockResolvedValue(LIDER);
    prisma.participacionProyecto.findMany.mockResolvedValue([
      participacion(5, 10, 'Desarrollador', 'RETIRADO'),
    ]);
    prisma.asignacionTarea.findMany.mockImplementation(async ({ where }: any) =>
      where.tarea.idProyecto === 1 ? [] : [{ idUsuario: 5 }],
    );
    prisma.tarea.findMany.mockResolvedValue([]);
    prisma.horasParticipacion.findMany.mockResolvedValue([]);
    const service = makeService(prisma);

    const resumen = await service.getTeamSummary(1, 1);

    expect(resumen.miembros).toHaveLength(1);
    expect(resumen.miembros[0].grupo).toBe('RETIRADOS_SIN_CONTRIBUCION');
    expect(prisma.asignacionTarea.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tarea: { idProyecto: 1 } }) }),
    );
  });

  // Caso 8 — tareas activas
  it('una tarea con estadoTarea != HECHO y asignación vigente incrementa tareasActivas', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 1 });
    prisma.usuario.findUnique.mockResolvedValue(LIDER);
    prisma.participacionProyecto.findMany.mockResolvedValue([participacion(2, 10)]);
    prisma.tarea.findMany.mockResolvedValue([
      { idTarea: 100, estadoTarea: 'EN_PROGRESO', asignaciones: [{ idUsuario: 2 }] },
    ]);
    prisma.horasParticipacion.findMany.mockResolvedValue([]);
    const service = makeService(prisma);

    const resumen = await service.getTeamSummary(1, 1);

    expect(resumen.miembros[0].tareasActivas).toBe(1);
    expect(resumen.miembros[0].tareasCompletadas).toBe(0);
  });

  // Caso 9 — tareas completadas
  it('una tarea con estadoTarea = HECHO incrementa tareasCompletadas', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 1 });
    prisma.usuario.findUnique.mockResolvedValue(LIDER);
    prisma.participacionProyecto.findMany.mockResolvedValue([participacion(2, 10)]);
    prisma.tarea.findMany.mockResolvedValue([
      { idTarea: 100, estadoTarea: 'HECHO', asignaciones: [{ idUsuario: 2 }] },
    ]);
    prisma.horasParticipacion.findMany.mockResolvedValue([]);
    const service = makeService(prisma);

    const resumen = await service.getTeamSummary(1, 1);

    expect(resumen.miembros[0].tareasCompletadas).toBe(1);
    expect(resumen.miembros[0].tareasActivas).toBe(0);
  });

  it('2 tareas no HECHO + 1 tarea HECHO producen tareasActivas = 2 y tareasCompletadas = 1', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 1 });
    prisma.usuario.findUnique.mockResolvedValue(LIDER);
    prisma.participacionProyecto.findMany.mockResolvedValue([participacion(2, 10)]);
    prisma.tarea.findMany.mockResolvedValue([
      { idTarea: 100, estadoTarea: 'POR_HACER', asignaciones: [{ idUsuario: 2 }] },
      { idTarea: 101, estadoTarea: 'EN_REVISION', asignaciones: [{ idUsuario: 2 }] },
      { idTarea: 102, estadoTarea: 'HECHO', asignaciones: [{ idUsuario: 2 }] },
    ]);
    prisma.horasParticipacion.findMany.mockResolvedValue([]);
    const service = makeService(prisma);

    const resumen = await service.getTeamSummary(1, 1);

    expect(resumen.miembros[0].tareasActivas).toBe(2);
    expect(resumen.miembros[0].tareasCompletadas).toBe(1);
  });

  // Caso 10 — soft-delete excluido (verificando el filtro de la query, no un
  // reprocesamiento en memoria de filas que Prisma nunca debería devolver)
  it('la query de tareas filtra eliminadoEn: null y desasignadaEn: null en la asignación vigente', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 1 });
    prisma.usuario.findUnique.mockResolvedValue(LIDER);
    prisma.participacionProyecto.findMany.mockResolvedValue([participacion(2, 10)]);
    prisma.tarea.findMany.mockResolvedValue([]);
    prisma.horasParticipacion.findMany.mockResolvedValue([]);
    const service = makeService(prisma);

    await service.getTeamSummary(1, 1);

    expect(prisma.tarea.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          idProyecto: 1,
          eliminadoEn: null,
          asignaciones: { some: { idUsuario: { in: [2] }, desasignadaEn: null } },
        },
        select: expect.objectContaining({
          asignaciones: expect.objectContaining({
            where: { idUsuario: { in: [2] }, desasignadaEn: null },
          }),
        }),
      }),
    );
  });

  // Caso 11 — horas reconocidas
  it.each([
    { label: '1 APROBADA con 5 horas', registros: [decimal(5)], esperado: 5 },
    { label: '2 APROBADAS 3 + 4', registros: [decimal(3), decimal(4)], esperado: 7 },
    { label: 'APROBADA con horasAprobadas null', registros: [null], esperado: 0 },
  ])('horasReconocidas: $label → $esperado', async ({ registros, esperado }) => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 1 });
    prisma.usuario.findUnique.mockResolvedValue(LIDER);
    prisma.participacionProyecto.findMany.mockResolvedValue([participacion(2, 10)]);
    prisma.tarea.findMany.mockResolvedValue([]);
    prisma.horasParticipacion.findMany.mockResolvedValue(
      registros.map((horasAprobadas) => ({ horasAprobadas, participacion: { idUsuario: 2 } })),
    );
    const service = makeService(prisma);

    const resumen = await service.getTeamSummary(1, 1);

    expect(resumen.miembros[0].horasReconocidas).toBe(esperado);
  });

  // Caso 12 — cero horas
  it('horasReconocidas = 0 cuando no existen registros HorasParticipacion APROBADA', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 1 });
    prisma.usuario.findUnique.mockResolvedValue(LIDER);
    prisma.participacionProyecto.findMany.mockResolvedValue([participacion(2, 10)]);
    prisma.tarea.findMany.mockResolvedValue([]);
    prisma.horasParticipacion.findMany.mockResolvedValue([]);
    const service = makeService(prisma);

    const resumen = await service.getTeamSummary(1, 1);

    expect(resumen.miembros[0].horasReconocidas).toBe(0);
  });

  // Caso 13 — aislamiento cross-project (asertando los filtros de idProyecto
  // en las tres queries batch, no solo el output esperado)
  it('aísla participaciones, tareas y horas al idProyecto solicitado', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 5, creadoPor: 1 });
    prisma.usuario.findUnique.mockResolvedValue(LIDER);
    prisma.participacionProyecto.findMany.mockResolvedValue([participacion(2, 10)]);
    prisma.tarea.findMany.mockResolvedValue([]);
    prisma.horasParticipacion.findMany.mockResolvedValue([]);
    const service = makeService(prisma);

    await service.getTeamSummary(5, 1);

    expect(prisma.participacionProyecto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ rolProyecto: { idProyecto: 5 } }) }),
    );
    expect(prisma.asignacionTarea.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tarea: { idProyecto: 5 } }) }),
    );
    expect(prisma.tarea.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ idProyecto: 5 }) }),
    );
    expect(prisma.horasParticipacion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          participacion: expect.objectContaining({ rolProyecto: { idProyecto: 5 } }),
        }),
      }),
    );
  });

  it('datos de un Proyecto B no afectan el resumen del Proyecto A (mock simula ambas bases en memoria)', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockImplementation(async ({ where }: any) =>
      where.idProyecto === 1 ? { idProyecto: 1, creadoPor: 1 } : { idProyecto: 2, creadoPor: 1 },
    );
    prisma.usuario.findUnique.mockResolvedValue(LIDER);
    // El mock respeta el filtro real (rolProyecto.idProyecto), igual que la
    // base de datos: proyectoB con su propio miembro nunca contamina A.
    prisma.participacionProyecto.findMany.mockImplementation(async ({ where }: any) =>
      where.rolProyecto.idProyecto === 1 ? [participacion(2, 10)] : [participacion(3, 20)],
    );
    prisma.tarea.findMany.mockImplementation(async ({ where }: any) =>
      where.idProyecto === 1
        ? [{ idTarea: 100, estadoTarea: 'HECHO', asignaciones: [{ idUsuario: 2 }] }]
        : [{ idTarea: 200, estadoTarea: 'HECHO', asignaciones: [{ idUsuario: 3 }] }],
    );
    prisma.horasParticipacion.findMany.mockImplementation(async ({ where }: any) =>
      where.participacion.rolProyecto.idProyecto === 1
        ? [{ horasAprobadas: decimal(5), participacion: { idUsuario: 2 } }]
        : [{ horasAprobadas: decimal(99), participacion: { idUsuario: 3 } }],
    );
    const service = makeService(prisma);

    const resumenA = await service.getTeamSummary(1, 1);

    expect(resumenA.miembros).toHaveLength(1);
    expect(resumenA.miembros[0].idUsuario).toBe(2);
    expect(resumenA.miembros.some((m) => m.idUsuario === 3)).toBe(false);
    expect(resumenA.miembros[0].tareasCompletadas).toBe(1);
    expect(resumenA.miembros[0].horasReconocidas).toBe(5);
  });

  // Caso 14 — no doble conteo de tareas: (idUsuario, idTarea) deduplicado
  it('dos filas de asignación vigente para el mismo (idUsuario, idTarea) cuentan la tarea una sola vez', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 1 });
    prisma.usuario.findUnique.mockResolvedValue(LIDER);
    prisma.participacionProyecto.findMany.mockResolvedValue([participacion(5, 10)]);
    prisma.tarea.findMany.mockResolvedValue([
      {
        idTarea: 10,
        estadoTarea: 'EN_PROGRESO',
        // Dato inesperado (el índice parcial real lo impediría), pero el
        // service debe defenderse igual mediante el Set (idUsuario:idTarea).
        asignaciones: [{ idUsuario: 5 }, { idUsuario: 5 }],
      },
    ]);
    prisma.horasParticipacion.findMany.mockResolvedValue([]);
    const service = makeService(prisma);

    const resumen = await service.getTeamSummary(1, 1);

    expect(resumen.miembros[0].tareasActivas).toBe(1);
  });

  // Caso 15 — no N+1: el número de queries es constante respecto al número de integrantes
  it('con 5 integrantes, múltiples roles, tareas, contribuciones y horas, ejecuta exactamente 6 queries Prisma fijas (no N+1)', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 1 });
    prisma.usuario.findUnique.mockResolvedValue(LIDER);

    const idsMiembros = [2, 3, 4, 5, 6];
    prisma.participacionProyecto.findMany.mockResolvedValue([
      ...idsMiembros.map((id) => participacion(id, 10, 'Desarrollador')),
      // El miembro 2 además tiene un segundo rol (multi-rol real).
      participacion(2, 11, 'QA'),
    ]);
    prisma.tarea.findMany.mockResolvedValue(
      idsMiembros.map((id, i) => ({
        idTarea: 100 + i,
        estadoTarea: i % 2 === 0 ? 'HECHO' : 'EN_PROGRESO',
        asignaciones: [{ idUsuario: id }],
      })),
    );
    prisma.horasParticipacion.findMany.mockResolvedValue(
      idsMiembros.map((id) => ({ horasAprobadas: decimal(2), participacion: { idUsuario: id } })),
    );
    const service = makeService(prisma);

    const resumen = await service.getTeamSummary(1, 1);

    expect(resumen.miembros).toHaveLength(5);
    expect(prisma.proyecto.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.usuario.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.participacionProyecto.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.asignacionTarea.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.tarea.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.horasParticipacion.findMany).toHaveBeenCalledTimes(1);
  });
});
