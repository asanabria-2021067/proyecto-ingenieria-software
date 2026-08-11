import { describe, expect, it, vi } from 'vitest';
import { ProjectsService } from '../src/projects/projects.service';

function makePrisma() {
  return {
    participacionProyecto: { findMany: vi.fn() },
    asignacionTarea: { findMany: vi.fn() },
  } as any;
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new ProjectsService(
    prisma,
    { isAdmin: vi.fn(), notifyAdminsFromTemplate: vi.fn(), notifyFromTemplate: vi.fn() } as any,
    {} as any,
  );
}

const USUARIO_ANA = {
  idUsuario: 2,
  nombre: 'Ana',
  apellido: 'Pérez',
  correo: 'ana@example.com',
  fotoUrl: null,
};

const participacionDe = (idUsuario: number, idParticipacion: number, usuario = USUARIO_ANA) => ({
  idParticipacion,
  estadoParticipacion: 'ACTIVO',
  fechaIngreso: new Date('2026-01-05T00:00:00.000Z'),
  usuario: { ...usuario, idUsuario },
  rolProyecto: { idRolProyecto: 5, nombreRol: 'Desarrollador', descripcionRolProyecto: null },
});

describe('ProjectsService.findTeam', () => {
  it('devuelve [] sin consultar asignaciones cuando el proyecto no tiene integrantes activos', async () => {
    const prisma = makePrisma();
    prisma.participacionProyecto.findMany.mockResolvedValue([]);
    const service = makeService(prisma);

    const equipo = await service.findTeam(1);

    expect(equipo).toEqual([]);
    expect(prisma.asignacionTarea.findMany).not.toHaveBeenCalled();
  });

  it('cuenta como tarea activa solo la asignación vigente sobre una tarea que no está HECHO', async () => {
    const prisma = makePrisma();
    prisma.participacionProyecto.findMany.mockResolvedValue([participacionDe(2, 10)]);
    prisma.asignacionTarea.findMany.mockResolvedValue([
      { idUsuario: 2, desasignadaEn: null, horasReales: null, tarea: { estadoTarea: 'EN_PROGRESO' } },
      { idUsuario: 2, desasignadaEn: null, horasReales: null, tarea: { estadoTarea: 'HECHO' } },
      {
        idUsuario: 2,
        desasignadaEn: new Date('2026-01-01T00:00:00.000Z'),
        horasReales: null,
        tarea: { estadoTarea: 'POR_HACER' },
      },
    ]);
    const service = makeService(prisma);

    const [fila] = await service.findTeam(1);

    // Solo la primera asignación es vigente y no-HECHO; la segunda está
    // HECHO y la tercera ya fue desasignada.
    expect(fila.tareasActivas).toBe(1);
  });

  it('horasRegistradas suma todos los tramos del usuario, incluidos los ya cerrados', async () => {
    const prisma = makePrisma();
    prisma.participacionProyecto.findMany.mockResolvedValue([participacionDe(2, 10)]);
    prisma.asignacionTarea.findMany.mockResolvedValue([
      {
        idUsuario: 2,
        desasignadaEn: new Date('2026-01-10T00:00:00.000Z'),
        horasReales: { toNumber: () => 3 },
        tarea: { estadoTarea: 'HECHO' },
      },
      {
        idUsuario: 2,
        desasignadaEn: null,
        horasReales: { toNumber: () => 2.5 },
        tarea: { estadoTarea: 'EN_PROGRESO' },
      },
    ]);
    const service = makeService(prisma);

    const [fila] = await service.findTeam(1);

    expect(fila.horasRegistradas).toBe(5.5);
  });

  it('un usuario sin ninguna asignación en el proyecto muestra 0 tareas activas y 0 horas, no error', async () => {
    const prisma = makePrisma();
    prisma.participacionProyecto.findMany.mockResolvedValue([participacionDe(2, 10)]);
    prisma.asignacionTarea.findMany.mockResolvedValue([]);
    const service = makeService(prisma);

    const [fila] = await service.findTeam(1);

    expect(fila.tareasActivas).toBe(0);
    expect(fila.horasRegistradas).toBe(0);
  });

  it('un usuario con dos participaciones activas (dos roles) recibe el mismo total agregado en ambas filas', async () => {
    const prisma = makePrisma();
    prisma.participacionProyecto.findMany.mockResolvedValue([
      participacionDe(2, 10),
      { ...participacionDe(2, 11), rolProyecto: { idRolProyecto: 6, nombreRol: 'QA', descripcionRolProyecto: null } },
    ]);
    prisma.asignacionTarea.findMany.mockResolvedValue([
      { idUsuario: 2, desasignadaEn: null, horasReales: { toNumber: () => 4 }, tarea: { estadoTarea: 'EN_PROGRESO' } },
    ]);
    const service = makeService(prisma);

    const [filaRol1, filaRol2] = await service.findTeam(1);

    expect(filaRol1.tareasActivas).toBe(1);
    expect(filaRol2.tareasActivas).toBe(1);
    expect(filaRol1.horasRegistradas).toBe(4);
    expect(filaRol2.horasRegistradas).toBe(4);
  });

  it('las métricas de un integrante no se mezclan con las de otro', async () => {
    const prisma = makePrisma();
    const usuarioBruno = { idUsuario: 3, nombre: 'Bruno', apellido: 'Ruiz', correo: 'bruno@example.com', fotoUrl: null };
    prisma.participacionProyecto.findMany.mockResolvedValue([
      participacionDe(2, 10),
      participacionDe(3, 11, usuarioBruno),
    ]);
    prisma.asignacionTarea.findMany.mockResolvedValue([
      { idUsuario: 2, desasignadaEn: null, horasReales: { toNumber: () => 1 }, tarea: { estadoTarea: 'EN_PROGRESO' } },
      { idUsuario: 3, desasignadaEn: null, horasReales: { toNumber: () => 9 }, tarea: { estadoTarea: 'EN_PROGRESO' } },
    ]);
    const service = makeService(prisma);

    const [filaAna, filaBruno] = await service.findTeam(1);

    expect(filaAna.horasRegistradas).toBe(1);
    expect(filaBruno.horasRegistradas).toBe(9);

    expect(prisma.asignacionTarea.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          idUsuario: { in: [2, 3] },
          tarea: { idProyecto: 1, eliminadoEn: null },
        }),
      }),
    );
  });
});
