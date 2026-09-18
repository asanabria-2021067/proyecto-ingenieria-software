import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EstadoParticipacion, EstadoProyecto, EstadoSprint, TipoProyecto } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { ProjectReadPolicyService } from '../src/common/project-policy/project-read-policy.service';
import type { TeamService } from '../src/team/team.service';
import type { SprintsService } from '../src/sprints/sprints.service';
import type { ProjectHoursSummaryService } from '../src/sprints/project-hours-summary.service';
import type { BitacoraEventosService } from '../src/bitacora/bitacora-eventos.service';
import { ExportsService } from '../src/exports/exports.service';
import { TipoEventoBitacora } from '../src/bitacora/tipos-evento-bitacora';

/**
 * T-259/T-260/T-261 (HU-164): ExportsService solo ORQUESTA — junta datos ya
 * calculados por TeamService/SprintsService/ProjectHoursSummaryService y
 * verifica la política 'exportacion'. Este spec no repite el cálculo de
 * horas/avance (ya cubierto en sus propios specs); verifica que se delega
 * correctamente, que se filtra RETIRADOS_SIN_CONTRIBUCION y que cada export
 * queda en la bitácora.
 */

const PROYECTO_BASE = {
  idProyecto: 5,
  tituloProyecto: 'Sistema de Bibliotecas',
  tipoProyecto: TipoProyecto.ACADEMICO_HORAS_BECA,
  estadoProyecto: EstadoProyecto.EN_PROGRESO,
  creadoPor: 1,
};

const EQUIPO_BASE = {
  lider: { idUsuario: 1, nombre: 'Ana', apellido: 'Líder', correo: 'ana@uvg.edu.gt', fotoUrl: null },
  miembros: [
    {
      idUsuario: 2,
      nombre: 'José',
      apellido: 'Peña Muñoz',
      correo: 'jose@uvg.edu.gt',
      fotoUrl: null,
      roles: [{ idRolProyecto: 10, nombreRol: 'Desarrollador' }],
      estadoParticipacion: EstadoParticipacion.ACTIVO,
      grupo: 'ACTIVOS' as const,
      tareasActivas: 1,
      tareasCompletadas: 2,
      horasReconocidas: 12.5,
    },
    {
      idUsuario: 3,
      nombre: 'Carla',
      apellido: 'Ruiz',
      correo: 'carla@uvg.edu.gt',
      fotoUrl: null,
      roles: [{ idRolProyecto: 11, nombreRol: 'Diseñadora' }],
      estadoParticipacion: EstadoParticipacion.RETIRADO,
      grupo: 'RETIRADOS_SIN_CONTRIBUCION' as const,
      tareasActivas: 0,
      tareasCompletadas: 0,
      horasReconocidas: 0,
    },
  ],
};

const AVANCE_BASE = {
  idProyecto: 5,
  sprints: [
    {
      idSprint: 1,
      numero: 1,
      estado: EstadoSprint.CERRADO,
      tareasPlanificadas: 4,
      tareasCompletadas: 3,
      porcentajeCumplimiento: 75,
      hitosTotales: 1,
      hitosCompletados: 1,
    },
  ],
};

function makeDeps(overrides: {
  proyecto?: typeof PROYECTO_BASE | null;
  decision?: Partial<{ profile: string; sprintEstados: readonly EstadoSprint[] | null }>;
  equipo?: typeof EQUIPO_BASE;
  horasPorUsuario?: Array<{ idUsuario: number; propuestasPendientes: string }>;
} = {}) {
  const proyecto = 'proyecto' in overrides ? overrides.proyecto : PROYECTO_BASE;

  const prisma = {
    proyecto: { findFirst: vi.fn().mockResolvedValue(proyecto) },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({ bitacoraAuditoria: { create: vi.fn() } })),
  } as unknown as PrismaService;

  const readPolicy = {
    assertRead: vi.fn().mockResolvedValue({
      profile: 'LIDER',
      sprintEstados: null,
      ...overrides.decision,
    }),
  } as unknown as ProjectReadPolicyService;

  const teamService = {
    buildTeamSummary: vi.fn().mockResolvedValue(overrides.equipo ?? EQUIPO_BASE),
  } as unknown as TeamService;

  const sprintsService = {
    computeSprintsComparative: vi.fn().mockResolvedValue(AVANCE_BASE),
  } as unknown as SprintsService;

  const projectHours = {
    forProject: vi.fn().mockResolvedValue({
      porUsuario: (
        overrides.horasPorUsuario ?? [
          { idUsuario: 2, propuestasPendientes: '3.50' },
          { idUsuario: 3, propuestasPendientes: '0.00' },
        ]
      ).map((fila) => ({ ...fila, idUsuario: fila.idUsuario })),
    }),
  } as unknown as ProjectHoursSummaryService;

  const bitacoraEventos = {
    registrarEvento: vi.fn().mockResolvedValue(undefined),
  } as unknown as BitacoraEventosService;

  return { prisma, readPolicy, teamService, sprintsService, projectHours, bitacoraEventos };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new ExportsService(
    deps.prisma,
    deps.readPolicy,
    deps.teamService,
    deps.sprintsService,
    deps.projectHours,
    deps.bitacoraEventos,
  );
}

describe('ExportsService.getProjectExportModel', () => {
  it('autoriza con el scope "exportacion" antes de tocar cualquier dato', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.getProjectExportModel(5, 9);

    expect(deps.readPolicy.assertRead).toHaveBeenCalledWith(undefined, {
      projectId: 5,
      actorId: 9,
      scope: 'exportacion',
    });
  });

  it('propaga el ForbiddenException de la política sin tocar TeamService/SprintsService', async () => {
    const deps = makeDeps();
    deps.readPolicy.assertRead = vi.fn().mockRejectedValue(new ForbiddenException());
    const service = makeService(deps);

    await expect(service.getProjectExportModel(5, 42)).rejects.toBeInstanceOf(ForbiddenException);
    expect(deps.teamService.buildTeamSummary).not.toHaveBeenCalled();
  });

  it('lanza NotFoundException si el proyecto no existe o está eliminado', async () => {
    const deps = makeDeps({ proyecto: null });
    const service = makeService(deps);

    await expect(service.getProjectExportModel(5, 9)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('excluye del export a los integrantes RETIRADOS_SIN_CONTRIBUCION', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const modelo = await service.getProjectExportModel(5, 9);

    expect(modelo.miembros.map((m) => m.idUsuario)).toEqual([2]);
  });

  it('usa exactamente TeamService.buildTeamSummary para horasConfirmadas — mismo cálculo que /miembros', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const modelo = await service.getProjectExportModel(5, 9);

    expect(deps.teamService.buildTeamSummary).toHaveBeenCalledWith(5, PROYECTO_BASE.creadoPor);
    expect(modelo.miembros[0].horasConfirmadas).toBe(12.5);
  });

  it('agrega horasPendientes desde ProjectHoursSummaryService.forProject', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const modelo = await service.getProjectExportModel(5, 9);

    expect(modelo.miembros[0].horasPendientes).toBe(3.5);
  });

  it('reusa el sprintEstados que ya resolvió la política, sin volver a autorizar en SprintsService', async () => {
    const deps = makeDeps({ decision: { sprintEstados: [EstadoSprint.CERRADO] } });
    const service = makeService(deps);

    await service.getProjectExportModel(5, 9);

    expect(deps.sprintsService.computeSprintsComparative).toHaveBeenCalledWith(5, [EstadoSprint.CERRADO]);
  });

  it('incluye el tipo de proyecto y el avance en el modelo', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const modelo = await service.getProjectExportModel(5, 9);

    expect(modelo.proyecto.tipoProyecto).toBe(TipoProyecto.ACADEMICO_HORAS_BECA);
    expect(modelo.avance).toBe(AVANCE_BASE);
  });

  it('un proyecto sin miembros produce un modelo con miembros: [] (T-262)', async () => {
    const deps = makeDeps({ equipo: { ...EQUIPO_BASE, miembros: [] }, horasPorUsuario: [] });
    const service = makeService(deps);

    const modelo = await service.getProjectExportModel(5, 9);

    expect(modelo.miembros).toEqual([]);
  });
});

describe('ExportsService.registrarExportacion', () => {
  it('registra el evento de bitácora dentro de una transacción, con tipoEntidad PROYECTO', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.registrarExportacion(5, 9, TipoEventoBitacora.PROJECT_EXPORT_CSV_GENERATED);

    expect(deps.prisma.$transaction).toHaveBeenCalled();
    expect(deps.bitacoraEventos.registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoEvento: TipoEventoBitacora.PROJECT_EXPORT_CSV_GENERATED,
        idActor: 9,
        idProyecto: 5,
        tipoEntidad: 'PROYECTO',
        idEntidad: 5,
      }),
    );
  });
});
