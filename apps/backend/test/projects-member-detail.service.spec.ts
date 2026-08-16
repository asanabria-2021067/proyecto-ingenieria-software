import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TeamService } from '../src/team/team.service';

function makePrisma() {
  return {
    proyecto: { findFirst: vi.fn() },
    participacionProyecto: { findMany: vi.fn() },
    tarea: { findMany: vi.fn() },
  } as any;
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new TeamService(prisma);
}

const USUARIO = {
  idUsuario: 2,
  nombre: 'Ana',
  apellido: 'Pérez',
  correo: 'ana@example.com',
  fotoUrl: null,
};

describe('TeamService.findTeamMemberDetail', () => {
  it('rechaza cuando el proyecto no existe', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(null);
    const service = makeService(prisma);

    await expect(service.findTeamMemberDetail(999, 2, 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rechaza a quien no es líder del proyecto', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 99 });
    const service = makeService(prisma);

    await expect(service.findTeamMemberDetail(1, 2, 1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // Ninguna consulta de participaciones/tareas debe ejecutarse tras el 403.
    expect(prisma.participacionProyecto.findMany).not.toHaveBeenCalled();
  });

  it('rechaza cuando idUsuario nunca participó en el proyecto', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 1 });
    prisma.participacionProyecto.findMany.mockResolvedValue([]);
    const service = makeService(prisma);

    await expect(service.findTeamMemberDetail(1, 2, 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.tarea.findMany).not.toHaveBeenCalled();
  });

  it('devuelve participaciones (activas e históricas) y el historial de tareas del integrante para el líder', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 1 });
    prisma.participacionProyecto.findMany.mockResolvedValue([
      {
        idParticipacion: 10,
        estadoParticipacion: 'ACTIVO',
        fechaIngreso: new Date('2026-01-05T00:00:00.000Z'),
        fechaSalida: null,
        rolProyecto: { idRolProyecto: 5, nombreRol: 'Desarrollador' },
        usuario: USUARIO,
      },
      {
        idParticipacion: 4,
        estadoParticipacion: 'RETIRADO',
        fechaIngreso: new Date('2025-06-01T00:00:00.000Z'),
        fechaSalida: new Date('2025-12-01T00:00:00.000Z'),
        rolProyecto: { idRolProyecto: 3, nombreRol: 'Diseñador' },
        usuario: USUARIO,
      },
    ]);
    prisma.tarea.findMany.mockResolvedValue([
      {
        idTarea: 100,
        tituloTarea: 'Diseñar wireframes',
        estadoTarea: 'HECHO',
        prioridad: 'ALTA',
        fechaCreacion: new Date('2026-01-10T12:00:00.000Z'),
        fechaLimite: new Date('2026-01-20T00:00:00.000Z'),
        actualizadaEn: new Date('2026-01-19T09:00:00.000Z'),
        tiempoEstimadoHoras: 8,
        asignaciones: [
          {
            fechaAsignacion: new Date('2026-01-10T12:00:00.000Z'),
            desasignadaEn: new Date('2026-01-19T09:00:00.000Z'),
            horasReales: { toNumber: () => 7.5 },
          },
        ],
      },
      {
        idTarea: 101,
        tituloTarea: 'Implementar formulario',
        estadoTarea: 'EN_PROGRESO',
        prioridad: 'MEDIA',
        fechaCreacion: new Date('2026-02-01T00:00:00.000Z'),
        fechaLimite: null,
        actualizadaEn: null,
        tiempoEstimadoHoras: null,
        asignaciones: [
          {
            fechaAsignacion: new Date('2026-02-01T00:00:00.000Z'),
            desasignadaEn: null,
            horasReales: null,
          },
        ],
      },
    ]);
    const service = makeService(prisma);

    const detalle = await service.findTeamMemberDetail(1, 2, 1);

    expect(detalle.usuario).toEqual(USUARIO);
    expect(detalle.participaciones).toEqual([
      expect.objectContaining({ idParticipacion: 10, estadoParticipacion: 'ACTIVO', fechaSalida: null }),
      expect.objectContaining({ idParticipacion: 4, estadoParticipacion: 'RETIRADO', fechaSalida: '2025-12-01' }),
    ]);
    expect(detalle.tareas).toHaveLength(2);
    expect(detalle.tareas[0]).toMatchObject({
      idTarea: 100,
      estadoTarea: 'HECHO',
      tiempoEstimadoHoras: 8,
      horasReales: 7.5,
      desasignadaEn: expect.any(Date),
    });
    expect(detalle.tareas[1]).toMatchObject({
      idTarea: 101,
      estadoTarea: 'EN_PROGRESO',
      tiempoEstimadoHoras: null,
      horasReales: null,
      desasignadaEn: null,
    });

    expect(prisma.tarea.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          idProyecto: 1,
          eliminadoEn: null,
          asignaciones: { some: { idUsuario: 2 } },
        }),
      }),
    );
  });

  it('aísla por proyecto: un usuario que participa en el Proyecto B no puede consultarse con el projectId del Proyecto A', async () => {
    const prisma = makePrisma();

    const PROYECTOS = [
      { idProyecto: 1, creadoPor: 10 }, // Proyecto A, líder 10
      { idProyecto: 2, creadoPor: 20 }, // Proyecto B, líder 20
    ];
    prisma.proyecto.findFirst.mockImplementation(async ({ where }: any) =>
      PROYECTOS.find((p) => p.idProyecto === where.idProyecto) ?? null,
    );

    // El usuario 2 SOLO participa en el rol 20, que pertenece al Proyecto B.
    const PARTICIPACIONES = [
      {
        idProyectoReal: 2,
        idParticipacion: 50,
        estadoParticipacion: 'ACTIVO',
        fechaIngreso: new Date('2026-01-01T00:00:00.000Z'),
        fechaSalida: null,
        rolProyecto: { idRolProyecto: 20, nombreRol: 'QA' },
        usuario: USUARIO,
      },
    ];
    prisma.participacionProyecto.findMany.mockImplementation(async ({ where }: any) => {
      return PARTICIPACIONES.filter(
        (p) => p.usuario.idUsuario === where.idUsuario && p.idProyectoReal === where.rolProyecto.idProyecto,
      ).map(({ idProyectoReal: _idProyectoReal, ...resto }) => resto);
    });
    prisma.tarea.findMany.mockResolvedValue([]);
    const service = makeService(prisma);

    // Proyecto A (líder 10) consultando al usuario 2: no es integrante de A.
    await expect(service.findTeamMemberDetail(1, 2, 10)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    // El mismo usuario SÍ es consultable desde el Proyecto B (su proyecto real),
    // lo que demuestra que el rechazo anterior es aislamiento real por
    // proyecto y no que el usuario nunca tenga participaciones en ningún lado.
    const detalleB = await service.findTeamMemberDetail(2, 2, 20);
    expect(detalleB.usuario.idUsuario).toBe(2);
  });

  it('una tarea con eliminadoEn distinto de null no aparece en el historial del integrante', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 1 });
    prisma.participacionProyecto.findMany.mockResolvedValue([
      {
        idParticipacion: 10,
        estadoParticipacion: 'ACTIVO',
        fechaIngreso: new Date('2026-01-01T00:00:00.000Z'),
        fechaSalida: null,
        rolProyecto: { idRolProyecto: 5, nombreRol: 'Desarrollador' },
        usuario: USUARIO,
      },
    ]);

    // Almacén en memoria con una tarea viva y una eliminada (soft delete),
    // ambas asignadas al mismo usuario; el mock filtra igual que Prisma
    // filtraría en una base real: solo devuelve filas cuyo eliminadoEn
    // coincide exactamente con el valor pedido (null).
    const TAREAS_DB = [
      {
        idTarea: 1,
        idProyecto: 1,
        eliminadoEn: null,
        tituloTarea: 'Tarea viva',
        estadoTarea: 'POR_HACER',
        prioridad: 'MEDIA',
        fechaCreacion: new Date('2026-01-01T00:00:00.000Z'),
        fechaLimite: null,
        actualizadaEn: null,
        tiempoEstimadoHoras: null,
        asignaciones: [
          { fechaAsignacion: new Date('2026-01-01T00:00:00.000Z'), desasignadaEn: null, horasReales: null },
        ],
      },
      {
        idTarea: 2,
        idProyecto: 1,
        eliminadoEn: new Date('2026-01-05T00:00:00.000Z'),
        tituloTarea: 'Tarea eliminada',
        estadoTarea: 'POR_HACER',
        prioridad: 'MEDIA',
        fechaCreacion: new Date('2026-01-01T00:00:00.000Z'),
        fechaLimite: null,
        actualizadaEn: null,
        tiempoEstimadoHoras: null,
        asignaciones: [
          { fechaAsignacion: new Date('2026-01-01T00:00:00.000Z'), desasignadaEn: null, horasReales: null },
        ],
      },
    ];
    prisma.tarea.findMany.mockImplementation(async ({ where }: any) =>
      TAREAS_DB.filter(
        (t) => t.idProyecto === where.idProyecto && t.eliminadoEn === where.eliminadoEn,
      ),
    );
    const service = makeService(prisma);

    const detalle = await service.findTeamMemberDetail(1, 2, 1);

    expect(detalle.tareas.map((t) => t.idTarea)).toEqual([1]);
    expect(detalle.tareas.some((t) => t.idTarea === 2)).toBe(false);
  });

  it('en una reasignación, cada integrante ve solo las horas de su propio tramo, nunca el total de la tarea', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 1 });

    // Tarea X reasignada: Usuario 2 trabajó 3h en su tramo (ya cerrado),
    // Usuario 3 trabajó 4h en el suyo (todavía activo). Cada AsignacionTarea
    // lleva sus propias horas; no existe un total único de la tarea.
    const TAREA_X_BASE = {
      idTarea: 100,
      idProyecto: 1,
      eliminadoEn: null,
      tituloTarea: 'Tarea X',
      estadoTarea: 'EN_PROGRESO',
      prioridad: 'MEDIA',
      fechaCreacion: new Date('2026-01-01T00:00:00.000Z'),
      fechaLimite: null,
      actualizadaEn: null,
      tiempoEstimadoHoras: null,
    };
    const ASIGNACIONES_POR_USUARIO: Record<number, any> = {
      2: {
        fechaAsignacion: new Date('2026-01-01T00:00:00.000Z'),
        desasignadaEn: new Date('2026-01-10T00:00:00.000Z'),
        horasReales: { toNumber: () => 3 },
      },
      3: {
        fechaAsignacion: new Date('2026-01-10T00:00:00.000Z'),
        desasignadaEn: null,
        horasReales: { toNumber: () => 4 },
      },
    };
    prisma.tarea.findMany.mockImplementation(async ({ where }: any) => {
      const idUsuario = where.asignaciones.some.idUsuario;
      const asignacion = ASIGNACIONES_POR_USUARIO[idUsuario];
      if (!asignacion) return [];
      return [{ ...TAREA_X_BASE, asignaciones: [asignacion] }];
    });

    const participacionDe = (idUsuario: number) => [
      {
        idParticipacion: idUsuario,
        estadoParticipacion: 'ACTIVO',
        fechaIngreso: new Date('2026-01-01T00:00:00.000Z'),
        fechaSalida: null,
        rolProyecto: { idRolProyecto: 5, nombreRol: 'Desarrollador' },
        usuario: { ...USUARIO, idUsuario },
      },
    ];
    const service = makeService(prisma);

    prisma.participacionProyecto.findMany.mockResolvedValue(participacionDe(2));
    const detalleA = await service.findTeamMemberDetail(1, 2, 1);
    expect(detalleA.tareas).toHaveLength(1);
    expect(detalleA.tareas[0].horasReales).toBe(3);

    prisma.participacionProyecto.findMany.mockResolvedValue(participacionDe(3));
    const detalleB = await service.findTeamMemberDetail(1, 3, 1);
    expect(detalleB.tareas).toHaveLength(1);
    expect(detalleB.tareas[0].horasReales).toBe(4);

    // Nunca deben verse iguales entre sí ni sumados (7h): cada uno ve
    // exclusivamente su propio tramo.
    expect(detalleA.tareas[0].horasReales).not.toBe(detalleB.tareas[0].horasReales);
  });

  it('el mismo usuario reasignado varias veces a la misma tarea suma las horas de todos sus tramos, sin perder el más antiguo', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 1 });
    prisma.participacionProyecto.findMany.mockResolvedValue([
      {
        idParticipacion: 10,
        estadoParticipacion: 'ACTIVO',
        fechaIngreso: new Date('2026-01-01T00:00:00.000Z'),
        fechaSalida: null,
        rolProyecto: { idRolProyecto: 5, nombreRol: 'Desarrollador' },
        usuario: USUARIO,
      },
    ]);

    // Usuario 2 fue asignado, desasignado y luego reasignado a la MISMA
    // tarea: dos filas de AsignacionTarea para (idUsuario, idTarea), cada
    // una con sus propias horas. orderBy fechaAsignacion desc ya aplicado
    // en el select real, así que el tramo más reciente va primero — el
    // resultado no debe depender de ese orden para la suma.
    prisma.tarea.findMany.mockResolvedValue([
      {
        idTarea: 100,
        tituloTarea: 'Tarea X',
        estadoTarea: 'HECHO',
        prioridad: 'MEDIA',
        fechaCreacion: new Date('2026-01-01T00:00:00.000Z'),
        fechaLimite: null,
        actualizadaEn: null,
        tiempoEstimadoHoras: null,
        asignaciones: [
          {
            // Tramo más reciente (reasignación).
            fechaAsignacion: new Date('2026-02-01T00:00:00.000Z'),
            desasignadaEn: null,
            horasReales: { toNumber: () => 1.5 },
          },
          {
            // Tramo original, ya cerrado.
            fechaAsignacion: new Date('2026-01-01T00:00:00.000Z'),
            desasignadaEn: new Date('2026-01-15T00:00:00.000Z'),
            horasReales: { toNumber: () => 2 },
          },
        ],
      },
    ]);
    const service = makeService(prisma);

    const detalle = await service.findTeamMemberDetail(1, 2, 1);

    expect(detalle.tareas).toHaveLength(1);
    expect(detalle.tareas[0].horasReales).toBe(3.5);
    // Las fechas mostradas corresponden al tramo vigente (el más reciente),
    // no al cerrado: la suma de horas no debe alterar esa semántica.
    expect(detalle.tareas[0].desasignadaEn).toBeNull();
  });
});
