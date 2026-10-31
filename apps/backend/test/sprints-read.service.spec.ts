import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { EstadoSprint, EstadoTarea, Prioridad } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { SprintsContextService } from '../src/sprints/sprints-context.service';
import type { SprintsAuthorizationService } from '../src/sprints/sprints-authorization.service';
import { SprintsReadService } from '../src/sprints/sprints-read.service';
import { makeProjectReadPolicyDouble } from './helpers/project-policy.double';

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    sprint: { findMany: vi.fn(), findFirst: vi.fn() },
    tarea: { findMany: vi.fn().mockResolvedValue([]) },
    hito: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    instantaneaSprint: { findMany: vi.fn().mockResolvedValue([]) },
    $queryRaw: vi.fn().mockResolvedValue([]),
    ...prismaOverrides,
  };
  const context = { sprintScopeWhere: vi.fn().mockReturnValue({ estado: 'CERRADO' }) };
  const authorization = {
    assertCanListSprintHistory: vi.fn().mockResolvedValue(undefined),
    assertCanViewSprintHistory: vi.fn().mockResolvedValue(undefined),
    assertCanViewSprintAnalytics: vi.fn().mockResolvedValue(undefined),
    assertCanListSprintAnalytics: vi.fn().mockResolvedValue(undefined),
  };
  const readPolicy = makeProjectReadPolicyDouble();
  const service = new SprintsReadService(
    prisma as unknown as PrismaService,
    context as unknown as SprintsContextService,
    authorization as unknown as SprintsAuthorizationService,
    readPolicy as never,
  );
  return { prisma, context, authorization, readPolicy, service };
}

describe('SprintsReadService', () => {
  it('listSprints: aplica politica de lectura, alcance por actor y completa agregados faltantes con 0', async () => {
    const { prisma, context, authorization, readPolicy, service } = makeService();
    prisma.sprint.findMany.mockResolvedValue([
      { idSprint: 1, numero: 2 },
      { idSprint: 2, numero: 1 },
    ]);
    prisma.$queryRaw.mockResolvedValue([{ idSprint: 1, tareas: 4, hitos: 2, horasEstimadas: 8 }]);

    const r = await service.listSprints(10, 99);

    expect(readPolicy.assertRead).toHaveBeenCalledWith(undefined, { projectId: 10, actorId: 99, scope: 'sprints' });
    expect(authorization.assertCanListSprintHistory).toHaveBeenCalledWith(10, 99);
    expect(context.sprintScopeWhere).toHaveBeenCalled();
    expect(prisma.sprint.findMany.mock.calls[0][0]).toMatchObject({
      where: { idProyecto: 10, estado: 'CERRADO' },
      orderBy: { numero: 'desc' },
    });
    expect(r).toEqual([
      { idSprint: 1, numero: 2, tareas: 4, hitos: 2, horasEstimadas: 8 },
      { idSprint: 2, numero: 1, tareas: 0, hitos: 0, horasEstimadas: 0 },
    ]);
  });

  it('getSprintDetail: Sprint de otro proyecto -> 404', async () => {
    const { prisma, service } = makeService();
    prisma.sprint.findFirst.mockResolvedValue(null);
    await expect(service.getSprintDetail(10, 5, 99)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.sprint.findFirst.mock.calls[0][0].where).toEqual({ idSprint: 5, idProyecto: 10 });
  });

  it('getSprintDetail: deriva el porcentaje del Hito con TODAS sus tareas vigentes y una sola copia por Hito', async () => {
    const { prisma, service } = makeService();
    prisma.sprint.findFirst.mockResolvedValue({
      idSprint: 5,
      idProyecto: 10,
      numero: 1,
      estado: EstadoSprint.CERRADO,
      fechaInicio: new Date(),
      fechaFinalizacionIniciada: null,
      fechaCierre: null,
      cerradoPor: null,
      tareas: [
        { idTarea: 1, idHito: 7, asignaciones: [{ idAsignacion: 1, horasReales: { toNumber: () => 2.5 } }], comentarios: [] },
        { idTarea: 2, idHito: 7, asignaciones: [], comentarios: [] },
      ],
    });
    prisma.hito.findMany.mockResolvedValue([{ idHito: 7, tituloHito: 'H', estadoHito: 'EN_PROGRESO' }]);
    prisma.tarea.findMany.mockResolvedValue([
      { idHito: 7, estadoTarea: EstadoTarea.HECHO },
      { idHito: 7, estadoTarea: EstadoTarea.POR_HACER },
    ]);

    const r = await service.getSprintDetail(10, 5, 99);

    expect(r.hitos).toEqual([{ idHito: 7, tituloHito: 'H', estadoHito: 'EN_PROGRESO', porcentaje: 50 }]);
    expect(r.tareas[0].asignaciones[0].horasReales).toBe(2.5);
    expect(r.tareas[1].asignaciones).toEqual([]);
  });

  it('getSprintAnalytics: cuenta distribucion por estado/prioridad, completadas y horas estimadas', async () => {
    const { prisma, service } = makeService();
    prisma.sprint.findFirst.mockResolvedValue({
      idSprint: 5,
      idProyecto: 10,
      numero: 1,
      estado: EstadoSprint.ACTIVO,
      tareas: [
        { estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.ALTA, idHito: null, tiempoEstimadoHoras: 3 },
        { estadoTarea: EstadoTarea.POR_HACER, prioridad: Prioridad.ALTA, idHito: null, tiempoEstimadoHoras: null },
      ],
    });
    const r = await service.getSprintAnalytics(10, 5, 99);
    expect(r.tareasTotales).toBe(2);
    expect(r.distribucionPorEstado[EstadoTarea.HECHO]).toBe(1);
    expect(r.distribucionPorEstado[EstadoTarea.EN_REVISION]).toBe(0);
    expect(r.distribucionPorPrioridad[Prioridad.ALTA]).toBe(2);
    expect(r.planificadoVsCompletado).toEqual({ tareasPlanificadas: 2, tareasCompletadas: 1, horasEstimadas: 3 });
  });

  it('computeSprintBurndown: CERRADO lee las columnas congeladas; ACTIVO agrega en vivo', async () => {
    const { prisma, service } = makeService();
    const base = { idSprint: 5, fechaInicio: new Date('2026-01-01T00:00:00Z'), fechaFinPlaneada: null };
    prisma.sprint.findFirst.mockResolvedValueOnce({
      ...base,
      estado: EstadoSprint.CERRADO,
      tareasPlanificadasCierre: 9,
      puntosHistoriaPlanificadosCierre: 21,
    });
    const cerrado = await service.computeSprintBurndown(10, 5);
    expect(cerrado).toMatchObject({ tareasPlanificadasTotal: 9, puntosHistoriaPlanificadosTotal: 21, fechaFinPlaneada: null });
    expect(prisma.tarea.findMany).not.toHaveBeenCalled();

    prisma.sprint.findFirst.mockResolvedValueOnce({ ...base, estado: EstadoSprint.ACTIVO });
    prisma.tarea.findMany.mockResolvedValueOnce([{ puntosHistoria: 3 }, { puntosHistoria: null }]);
    const activo = await service.computeSprintBurndown(10, 5);
    expect(activo).toMatchObject({ tareasPlanificadasTotal: 2, puntosHistoriaPlanificadosTotal: 3 });
  });

  it('computeSprintsComparative: calcula porcentajeCumplimiento (0 si no hay planificadas)', async () => {
    const { prisma, service } = makeService();
    prisma.$queryRaw.mockResolvedValue([
      { idSprint: 1, tareasPlanificadas: 4, tareasCompletadas: 1 },
      { idSprint: 2, tareasPlanificadas: 0, tareasCompletadas: 0 },
    ]);
    const r = await service.computeSprintsComparative(10, null);
    expect(r.idProyecto).toBe(10);
    expect(r.sprints.map((s) => s.porcentajeCumplimiento)).toEqual([25, 0]);
  });

  it('calcularCongeladoDeCierreTx: cuenta arrastradas, puntos null si ninguna lleva puntos e hitos distintos completados', async () => {
    const { service } = makeService();
    const tx = {
      tarea: {
        findMany: vi.fn().mockResolvedValue([
          { estadoTarea: EstadoTarea.HECHO, idHito: 1, puntosHistoria: null },
          { estadoTarea: EstadoTarea.POR_HACER, idHito: 1, puntosHistoria: null },
        ]),
      },
      hito: { count: vi.fn().mockResolvedValue(1) },
    };
    const r = await service.calcularCongeladoDeCierreTx(tx as never, 10, 5);
    expect(r).toMatchObject({
      tareasPlanificadasCierre: 2,
      tareasCompletadasCierre: 1,
      tareasArrastradasCierre: 1,
      porcentajeCumplimientoCierre: 50,
      hitosTotalesCierre: 1,
      hitosCompletadosCierre: 1,
      puntosHistoriaPlanificadosCierre: null,
      puntosHistoriaCompletadosCierre: null,
    });
  });
});
