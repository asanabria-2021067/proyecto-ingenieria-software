import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EstadoParticipacion, EstadoHoras, EstadoProyecto, EstadoSprint, Prisma, TipoProyecto } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { ProjectReadPolicyService } from '../src/common/project-policy/project-read-policy.service';
import type { TeamService } from '../src/team/team.service';
import type { SprintsService } from '../src/sprints/sprints.service';
import type { ProjectHoursSummaryService } from '../src/sprints/project-hours-summary.service';
import type { BitacoraEventosService } from '../src/bitacora/bitacora-eventos.service';
import { ExportsService } from '../src/exports/exports.service';
import { TipoEventoBitacora } from '../src/bitacora/tipos-evento-bitacora';
import { DEFAULT_EXPORT_OPTIONS } from '../src/exports/export-options';

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
  fechaCreacion: new Date('2026-01-10T15:00:00.000Z'),
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
  sprintsFechas?: Array<{ idSprint: number; fechaInicio: Date; fechaCierre: Date | null; fechaFinPlaneada: Date | null }>;
  horasRango?: unknown[];
} = {}) {
  const proyecto = 'proyecto' in overrides ? overrides.proyecto : PROYECTO_BASE;

  const prisma = {
    proyecto: { findFirst: vi.fn().mockResolvedValue(proyecto) },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({ bitacoraAuditoria: { create: vi.fn() } })),
    sprint: { findMany: vi.fn().mockResolvedValue(overrides.sprintsFechas ?? []) },
    horasParticipacion: { findMany: vi.fn().mockResolvedValue(overrides.horasRango ?? []) },
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
    computeSprintBurndown: vi.fn().mockImplementation((projectId: number, idSprint: number) =>
      Promise.resolve({
        idSprint,
        fechaInicio: '2026-01-01T00:00:00.000Z',
        fechaFinPlaneada: '2026-01-15T00:00:00.000Z',
        tareasPlanificadasTotal: 4,
        puntosHistoriaPlanificadosTotal: 13,
        instantaneas: [],
      }),
    ),
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

describe('ExportsService — validación del rango de fechas', () => {
  const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  const con = (desde: string | null, hasta: string | null) => ({
    ...DEFAULT_EXPORT_OPTIONS,
    desde: desde ? dia(desde) : null,
    hasta: hasta ? dia(hasta) : null,
  });
  const intentar = (desde: string | null, hasta: string | null) =>
    makeService(makeDeps()).getProjectExportModel(5, 9, con(desde, hasta));

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-24T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('"Desde" anterior a la creación del proyecto: 400 que dice que debe ser posterior a la creación', async () => {
    await expect(intentar('2026-01-09', null)).rejects.toThrow(
      'La fecha "Desde" debe ser igual o posterior a la fecha de creación del proyecto (10/01/2026).',
    );
    await expect(intentar('2026-01-09', null)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('"Desde" igual al día de creación es válido', async () => {
    await expect(intentar('2026-01-10', null)).resolves.toBeDefined();
  });

  it('"Hasta" posterior a la fecha actual: 400 que dice que no puede ser futura', async () => {
    await expect(intentar(null, '2026-09-26')).rejects.toThrow(
      'La fecha "Hasta" no puede ser posterior a la fecha actual.',
    );
  });

  it('"Hasta" igual a hoy es válido', async () => {
    await expect(intentar(null, '2026-09-24')).resolves.toBeDefined();
  });

  it('tolera un día de diferencia horaria: el "hoy" de un usuario al oeste de UTC puede ser mañana en UTC', async () => {
    await expect(intentar(null, '2026-09-25')).resolves.toBeDefined();
  });

  it('"Desde" posterior a la fecha actual también es 400', async () => {
    await expect(intentar('2026-10-30', null)).rejects.toThrow(
      'La fecha "Desde" no puede ser posterior a la fecha actual.',
    );
  });

  it('"Hasta" anterior a la creación del proyecto es 400', async () => {
    await expect(intentar(null, '2026-01-01')).rejects.toThrow(
      'La fecha "Hasta" debe ser igual o posterior a la fecha de creación del proyecto (10/01/2026).',
    );
  });

  it('un rango válido dentro de [creación, hoy] pasa', async () => {
    await expect(intentar('2026-02-01', '2026-03-01')).resolves.toBeDefined();
  });

  it('valida DESPUÉS de autorizar: un actor sin permiso recibe 403, no información sobre la fecha de creación', async () => {
    const deps = makeDeps();
    deps.readPolicy.assertRead = vi.fn().mockRejectedValue(new ForbiddenException());

    await expect(makeService(deps).getProjectExportModel(5, 42, con('2020-01-01', null))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('sin fechas no valida nada', async () => {
    await expect(intentar(null, null)).resolves.toBeDefined();
  });
});

describe('ExportsService — rango de fechas', () => {
  const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  const opciones = (desde: string | null, hasta: string | null) => ({
    ...DEFAULT_EXPORT_OPTIONS,
    desde: desde ? dia(desde) : null,
    hasta: hasta ? dia(hasta) : null,
  });
  const fila = (estado: EstadoHoras, aprobadas: number | null, calculadas: number | null, idUsuario = 2) => ({
    estadoHoras: estado,
    horasAprobadas: aprobadas === null ? null : new Prisma.Decimal(aprobadas),
    horasCalculadas: calculadas === null ? null : new Prisma.Decimal(calculadas),
    participacion: { idUsuario },
  });

  it('sin rango no consulta horas ni fechas de Sprint: conserva el cálculo idéntico a la pantalla', async () => {
    const deps = makeDeps();

    await makeService(deps).getProjectExportModel(5, 9, DEFAULT_EXPORT_OPTIONS);

    expect(deps.prisma.horasParticipacion.findMany).not.toHaveBeenCalled();
    expect(deps.prisma.sprint.findMany).not.toHaveBeenCalled();
  });

  it('con rango recalcula las horas del integrante solo con periodos que se traslapan con el rango', async () => {
    const deps = makeDeps({
      horasRango: [fila('APROBADA', 4, 4), fila('APROBADA', 2.5, 2.5), fila('PENDIENTE', null, 3)],
    });

    const modelo = await makeService(deps).getProjectExportModel(5, 9, opciones('2026-02-01', '2026-02-28'));

    expect(modelo.miembros[0].horasConfirmadas).toBe(6.5);
    expect(modelo.miembros[0].horasPendientes).toBe(3);
    const where = (deps.prisma.horasParticipacion.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
    expect(where.periodoInicio).toEqual({ lte: dia('2026-02-28') });
    expect(where.periodoFin).toEqual({ gte: dia('2026-02-01') });
  });

  it('un integrante sin horas dentro del rango queda en 0, no con las horas totales', async () => {
    const deps = makeDeps({ horasRango: [] });

    const modelo = await makeService(deps).getProjectExportModel(5, 9, opciones('2026-02-01', null));

    expect(modelo.miembros[0].horasConfirmadas).toBe(0);
    expect(modelo.miembros[0].horasPendientes).toBe(0);
  });

  it('con rango deja solo los Sprints que se traslapan con él', async () => {
    const deps = makeDeps({
      sprintsFechas: [
        { idSprint: 1, fechaInicio: dia('2026-01-01'), fechaCierre: dia('2026-01-15'), fechaFinPlaneada: dia('2026-01-14') },
        { idSprint: 2, fechaInicio: dia('2026-02-01'), fechaCierre: dia('2026-02-15'), fechaFinPlaneada: dia('2026-02-14') },
        { idSprint: 3, fechaInicio: dia('2026-03-01'), fechaCierre: null, fechaFinPlaneada: null },
      ],
    });
    (deps.sprintsService.computeSprintsComparative as ReturnType<typeof vi.fn>).mockResolvedValue({
      idProyecto: 5,
      sprints: [1, 2, 3].map((n) => ({
        idSprint: n, numero: n, estado: n === 3 ? EstadoSprint.ACTIVO : EstadoSprint.CERRADO,
        tareasPlanificadas: 1, tareasCompletadas: 1, porcentajeCumplimiento: 100, hitosTotales: 0, hitosCompletados: 0,
      })),
    });

    const modelo = await makeService(deps).getProjectExportModel(5, 9, opciones('2026-02-10', '2026-02-20'));

    expect(modelo.avance.sprints.map((s) => s.idSprint)).toEqual([2]);
    expect(modelo.sprintPortada).toBe(2);
  });

  it('un Sprint aún abierto (sin fecha de cierre ni fin planeada) se traslapa con cualquier rango posterior a su inicio', async () => {
    const deps = makeDeps({
      sprintsFechas: [{ idSprint: 3, fechaInicio: dia('2026-03-01'), fechaCierre: null, fechaFinPlaneada: null }],
    });
    (deps.sprintsService.computeSprintsComparative as ReturnType<typeof vi.fn>).mockResolvedValue({
      idProyecto: 5,
      sprints: [{
        idSprint: 3, numero: 3, estado: EstadoSprint.ACTIVO, tareasPlanificadas: 1, tareasCompletadas: 0,
        porcentajeCumplimiento: 0, hitosTotales: 0, hitosCompletados: 0,
      }],
    });

    const modelo = await makeService(deps).getProjectExportModel(5, 9, opciones('2026-06-01', '2026-06-30'));

    expect(modelo.avance.sprints).toHaveLength(1);
  });
});

describe('ExportsService — sprint de la portada', () => {
  const sprint = (idSprint: number, numero: number, estado: EstadoSprint) => ({
    idSprint,
    numero,
    estado,
    tareasPlanificadas: 1,
    tareasCompletadas: 0,
    porcentajeCumplimiento: 0,
    hitosTotales: 0,
    hitosCompletados: 0,
  });

  async function portadaCon(sprints: ReturnType<typeof sprint>[]) {
    const deps = makeDeps();
    (deps.sprintsService.computeSprintsComparative as ReturnType<typeof vi.fn>).mockResolvedValue({
      idProyecto: 5,
      sprints,
    });
    return (await makeService(deps).getProjectExportModel(5, 9)).sprintPortada;
  }

  it('usa el Sprint activo cuando existe', async () => {
    expect(
      await portadaCon([sprint(1, 1, EstadoSprint.CERRADO), sprint(2, 2, EstadoSprint.ACTIVO)]),
    ).toBe(2);
  });

  it('un Sprint en finalización también cuenta como en curso', async () => {
    expect(
      await portadaCon([sprint(1, 1, EstadoSprint.CERRADO), sprint(2, 2, EstadoSprint.EN_FINALIZACION)]),
    ).toBe(2);
  });

  it('sin Sprint activo usa el último cerrado (el de mayor número)', async () => {
    expect(
      await portadaCon([sprint(1, 1, EstadoSprint.CERRADO), sprint(2, 2, EstadoSprint.CERRADO)]),
    ).toBe(2);
  });

  it('sin Sprints devuelve null', async () => {
    expect(await portadaCon([])).toBeNull();
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

describe('ExportsService.registrarExportacion — detalle', () => {
  it('guarda las opciones usadas en valorNuevo de la bitácora', async () => {
    const deps = makeDeps();

    await makeService(deps).registrarExportacion(5, 9, TipoEventoBitacora.PROJECT_EXPORT_PDF_GENERATED, {
      fuente: 'grande',
    });

    expect(deps.bitacoraEventos.registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({ valorNuevo: { fuente: 'grande' } }),
    );
  });
});

describe('ExportsService.getBurndownForClosedSprints (T-260)', () => {
  it('pide el burndown de cada sprint cerrado, sin autorizar de nuevo (el caller ya autorizó)', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const burndowns = await service.getBurndownForClosedSprints(5, [10, 11]);

    expect(deps.sprintsService.computeSprintBurndown).toHaveBeenCalledWith(5, 10);
    expect(deps.sprintsService.computeSprintBurndown).toHaveBeenCalledWith(5, 11);
    expect(burndowns).toHaveLength(2);
    expect(burndowns.map((b) => b.idSprint)).toEqual([10, 11]);
  });

  it('una lista vacía de sprints cerrados no llama a computeSprintBurndown y devuelve []', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const burndowns = await service.getBurndownForClosedSprints(5, []);

    expect(deps.sprintsService.computeSprintBurndown).not.toHaveBeenCalled();
    expect(burndowns).toEqual([]);
  });
});
