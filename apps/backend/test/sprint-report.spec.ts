import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { buildSprintReportCsv, renderSprintReportPdf, type ModeloReporteSprint } from '../src/seguimiento/sprint-report.builder';
import { SprintReportService } from '../src/seguimiento/sprint-report.service';
import { TipoEventoBitacora } from '../src/bitacora/tipos-evento-bitacora';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { ProjectReadPolicyService } from '../src/common/project-policy/project-read-policy.service';
import type { SprintsContextService } from '../src/sprints/sprints-context.service';
import type { BitacoraEventosService } from '../src/bitacora/bitacora-eventos.service';

const MODELO: ModeloReporteSprint = {
  proyecto: 'Feria de Ciencias',
  sprint: { numero: 2, estado: 'CERRADO', fechaInicio: '2026-10-01', fechaFinPlaneada: '2026-10-15', fechaCierre: '2026-10-16' },
  resumen: { tareasPlanificadas: 4, tareasCompletadas: 3, porcentajeCumplimiento: 75, puntosPlanificados: 13, puntosCompletados: 8 },
  tareas: [
    { titulo: 'Diseñar afiche', estado: 'HECHO', prioridad: 'ALTA', puntos: 5, responsable: 'Ana Paz', horas: 3.5, fechaLimite: '2026-10-10', hito: 'Difusión' },
    { titulo: '=HYPERLINK("http://x")', estado: 'POR_HACER', prioridad: 'BAJA', puntos: null, responsable: 'Sin asignar', horas: 0, fechaLimite: null, hito: '' },
  ],
  integrantes: [{ nombre: 'Ana Paz', tareasHechas: 1, horas: 3.5 }],
  retrospectiva: { quePaso: 'Se entregó', quePodriaMejorar: 'Estimar', acuerdos: 'Daily' },
  generadoEn: '2026-10-20',
};

describe('reporte del Sprint (MEJ-23) - archivos', () => {
  it('CSV con BOM, resumen, tareas, integrantes y retrospectiva', () => {
    const csv = buildSprintReportCsv(MODELO);
    expect(csv.startsWith('﻿Proyecto;Feria de Ciencias')).toBe(true);
    expect(csv).toContain('Cumplimiento (%);75');
    expect(csv).toContain('Tarea;Estado;Prioridad;Puntos;Responsable;Horas;Fecha límite;Hito');
    expect(csv).toContain('Diseñar afiche;HECHO;ALTA;5;Ana Paz;3.5;10/10/2026;Difusión');
    expect(csv).toContain('Ana Paz;1;3.5');
    expect(csv).toContain('Acuerdos;Daily');
  });

  it('CSV neutraliza fórmulas en los títulos y omite la retrospectiva si no existe', () => {
    const csv = buildSprintReportCsv({ ...MODELO, retrospectiva: null });
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).not.toContain('Retrospectiva');
  });

  it('PDF válido', () => {
    const pdf = renderSprintReportPdf(MODELO);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
    expect(renderSprintReportPdf({ ...MODELO, tareas: [], integrantes: [], retrospectiva: null }).subarray(0, 5).toString()).toBe('%PDF-');
  });
});

function build() {
  const prisma = {
    tarea: {
      findMany: vi.fn().mockResolvedValue([
        {
          tituloTarea: 'Diseñar afiche',
          estadoTarea: 'HECHO',
          prioridad: 'ALTA',
          puntosHistoria: 5,
          fechaLimite: new Date('2026-10-10T00:00:00.000Z'),
          hito: { tituloHito: 'Difusión' },
          asignaciones: [
            { horasReales: '3.50', desasignadaEn: null, usuario: { nombre: 'Ana', apellido: 'Paz' } },
            { horasReales: '1', desasignadaEn: new Date(), usuario: { nombre: 'Luis', apellido: 'Gil' } },
          ],
        },
        {
          tituloTarea: 'Redactar guion',
          estadoTarea: 'POR_HACER',
          prioridad: 'MEDIA',
          puntosHistoria: 3,
          fechaLimite: null,
          hito: null,
          asignaciones: [],
        },
      ]),
    },
    retrospectivaSprint: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn().mockImplementation((fn: (t: unknown) => unknown) => fn({})),
  };
  const readPolicy = { assertRead: vi.fn().mockResolvedValue({}) };
  const sprint = {
    numero: 3,
    estado: 'ACTIVO',
    fechaInicio: new Date('2026-11-01T10:00:00.000Z'),
    fechaFinPlaneada: null,
    fechaCierre: null,
    tareasPlanificadasCierre: null,
  };
  const sprintsContext = {
    getProjectOrThrow: vi.fn().mockResolvedValue({ tituloProyecto: 'Feria' }),
    getSprintInProjectOrThrow: vi.fn().mockResolvedValue(sprint),
  };
  const bitacora = { registrarEvento: vi.fn().mockResolvedValue(undefined) };
  const service = new SprintReportService(
    prisma as unknown as PrismaService,
    readPolicy as unknown as ProjectReadPolicyService,
    sprintsContext as unknown as SprintsContextService,
    bitacora as unknown as BitacoraEventosService,
  );
  return { prisma, readPolicy, sprintsContext, bitacora, service, sprint };
}

describe('SprintReportService (MEJ-23)', () => {
  it('autoriza con el scope exportacion (líder y administración) y limita al sprint pedido', async () => {
    const { readPolicy, service } = build();
    await service.modelo(5, 8, 1);
    expect(readPolicy.assertRead).toHaveBeenCalledWith(undefined, { projectId: 5, actorId: 1, scope: 'exportacion', entitySprintId: 8 });
  });

  it('un participante recibe 403 y no se lee ninguna tarea', async () => {
    const { prisma, readPolicy, service } = build();
    readPolicy.assertRead.mockRejectedValue(new ForbiddenException('No tienes acceso'));
    await expect(service.csv(5, 8, 2)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.tarea.findMany).not.toHaveBeenCalled();
  });

  it('calcula el resumen en vivo para un sprint abierto y agrupa horas por responsable', async () => {
    const { service } = build();
    const m = await service.modelo(5, 8, 1);
    expect(m.resumen).toEqual({
      tareasPlanificadas: 2,
      tareasCompletadas: 1,
      porcentajeCumplimiento: 50,
      puntosPlanificados: 8,
      puntosCompletados: 5,
    });
    expect(m.tareas[0]).toMatchObject({ responsable: 'Ana Paz', horas: 4.5, fechaLimite: '2026-10-10', hito: 'Difusión' });
    expect(m.tareas[1]).toMatchObject({ responsable: 'Sin asignar', horas: 0, hito: '' });
    expect(m.integrantes).toEqual([
      { nombre: 'Ana Paz', tareasHechas: 1, horas: 3.5 },
      { nombre: 'Luis Gil', tareasHechas: 0, horas: 1 },
    ]);
  });

  it('un sprint cerrado usa la instantánea congelada y no recalcula', async () => {
    const { sprintsContext, sprint, service } = build();
    sprintsContext.getSprintInProjectOrThrow.mockResolvedValue({
      ...sprint,
      estado: 'CERRADO',
      tareasPlanificadasCierre: 10,
      tareasCompletadasCierre: 9,
      porcentajeCumplimientoCierre: 90,
      puntosHistoriaPlanificadosCierre: 40,
      puntosHistoriaCompletadosCierre: 35,
    });
    expect((await service.modelo(5, 8, 1)).resumen).toEqual({
      tareasPlanificadas: 10,
      tareasCompletadas: 9,
      porcentajeCumplimiento: 90,
      puntosPlanificados: 40,
      puntosCompletados: 35,
    });
  });

  it('deja el rastro en la bitácora después de generar CSV y PDF', async () => {
    const { bitacora, service } = build();
    expect((await service.csv(5, 8, 1)).toString('utf-8')).toContain('Feria');
    expect((await service.pdf(5, 8, 1)).subarray(0, 5).toString()).toBe('%PDF-');
    expect(bitacora.registrarEvento).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ tipoEvento: TipoEventoBitacora.PROJECT_EXPORT_CSV_GENERATED, idSprint: 8, tipoEntidad: 'SPRINT' }),
    );
    expect(bitacora.registrarEvento).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ tipoEvento: TipoEventoBitacora.PROJECT_EXPORT_PDF_GENERATED }),
    );
  });
});
