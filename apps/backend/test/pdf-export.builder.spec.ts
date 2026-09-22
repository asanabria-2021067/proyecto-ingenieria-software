import { describe, expect, it } from 'vitest';
import { EstadoParticipacion, EstadoProyecto, EstadoSprint, TipoProyecto } from '@prisma/client';
import { renderProjectReportPdf } from '../src/exports/pdf-export.builder';
import type { ProjectExportModel } from '../src/exports/dto/project-export.dto';
import type { SprintBurndownDto } from '../src/sprints/dto/sprint-burndown.dto';

function makeModelo(overrides: Partial<ProjectExportModel> = {}): ProjectExportModel {
  return {
    proyecto: {
      idProyecto: 5,
      tituloProyecto: 'Sistema de Bibliotecas',
      tipoProyecto: TipoProyecto.ACADEMICO_HORAS_BECA,
      estadoProyecto: EstadoProyecto.EN_PROGRESO,
    },
    lider: { idUsuario: 1, nombre: 'Ana', apellido: 'Peña Muñoz', correo: 'ana@uvg.edu.gt', fotoUrl: null },
    miembros: [
      {
        idUsuario: 2,
        nombre: 'José',
        apellido: 'Andrés Gómez',
        correo: 'jose@uvg.edu.gt',
        rol: 'Desarrollador',
        estadoParticipacion: EstadoParticipacion.ACTIVO,
        grupo: 'ACTIVOS',
        horasConfirmadas: 12.5,
        horasPendientes: 3.5,
      },
    ],
    fechaGeneracion: new Date('2026-03-05T15:30:00.000Z'),
    avance: {
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
    },
    ...overrides,
  };
}

function makeBurndown(overrides: Partial<SprintBurndownDto> = {}): SprintBurndownDto {
  return {
    idSprint: 1,
    fechaInicio: '2026-02-01T00:00:00.000Z',
    fechaFinPlaneada: '2026-02-10T00:00:00.000Z',
    tareasPlanificadasTotal: 4,
    puntosHistoriaPlanificadosTotal: 13,
    instantaneas: [
      { fecha: '2026-02-01T00:00:00.000Z', tareasPendientes: 4, tareasCompletadas: 0, puntosHistoriaRestantes: 13 },
      { fecha: '2026-02-02T00:00:00.000Z', tareasPendientes: 2, tareasCompletadas: 2, puntosHistoriaRestantes: 6 },
    ],
    ...overrides,
  };
}

describe('renderProjectReportPdf (T-260)', () => {
  it('genera un PDF con al menos una página', () => {
    const { pdf, resumen } = renderProjectReportPdf(makeModelo(), []);

    expect(pdf.length).toBeGreaterThan(0);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(resumen.paginas).toBeGreaterThanOrEqual(1);
  });

  it('incluye el nombre del proyecto y la fecha de generación en el encabezado', () => {
    const { resumen } = renderProjectReportPdf(makeModelo(), []);

    expect(resumen.textosRenderizados.some((t) => t.includes('Sistema de Bibliotecas'))).toBe(true);
    expect(resumen.textosRenderizados.some((t) => t.includes('05/03/2026'))).toBe(true);
  });

  it('conserva acentos y ñ de nombres de líder e integrantes', () => {
    const { resumen } = renderProjectReportPdf(makeModelo(), []);

    expect(resumen.textosRenderizados.some((t) => t.includes('Peña Muñoz'))).toBe(true);
    expect(resumen.textosRenderizados.some((t) => t.includes('José'))).toBe(true);
  });

  it('incluye los totales de horas confirmadas/pendientes de cada integrante', () => {
    const { resumen } = renderProjectReportPdf(makeModelo(), []);

    expect(resumen.filasMiembros).toBe(1);
    expect(resumen.textosRenderizados.some((t) => t.includes('12.50'))).toBe(true);
    expect(resumen.textosRenderizados.some((t) => t.includes('3.50'))).toBe(true);
  });

  it('incluye el avance por Sprint sin usar métricas de velocity/puntos', () => {
    const { resumen } = renderProjectReportPdf(makeModelo(), []);

    expect(resumen.textosRenderizados.some((t) => t.includes('75'))).toBe(true);
    expect(resumen.textosRenderizados.join(' ')).not.toMatch(/velocity|puntos de historia/i);
  });

  it('un proyecto sin miembros y sin sprints genera un PDF válido, no vacío (T-262)', () => {
    const { pdf, resumen } = renderProjectReportPdf(
      makeModelo({ miembros: [], avance: { idProyecto: 5, sprints: [] } }),
      [],
    );

    expect(pdf.length).toBeGreaterThan(0);
    expect(resumen.filasMiembros).toBe(0);
  });

  describe('burndown (T-260)', () => {
    it('sin sprints cerrados (burndowns vacío): avisa que aún no está disponible, sin dibujar ningún gráfico', () => {
      const { resumen } = renderProjectReportPdf(makeModelo(), []);

      expect(
        resumen.textosRenderizados.some((t) => t.includes('estará disponible en este reporte cuando se cierre')),
      ).toBe(true);
      expect(resumen.textosRenderizados).not.toContain('Real');
    });

    it('con al menos un sprint cerrado: imprime su burndown identificado por número de Sprint', () => {
      const { resumen } = renderProjectReportPdf(makeModelo(), [makeBurndown({ idSprint: 1 })]);

      expect(resumen.textosRenderizados.some((t) => t.includes('Sprint 1') && t.includes('story points'))).toBe(
        true,
      );
      expect(resumen.textosRenderizados).toContain('Real');
    });

    it('imprime un burndown por cada sprint cerrado recibido, no solo el primero', () => {
      const modelo = makeModelo({
        avance: {
          idProyecto: 5,
          sprints: [
            {
              idSprint: 1,
              numero: 1,
              estado: EstadoSprint.CERRADO,
              tareasPlanificadas: 4,
              tareasCompletadas: 4,
              porcentajeCumplimiento: 100,
              hitosTotales: 1,
              hitosCompletados: 1,
            },
            {
              idSprint: 2,
              numero: 2,
              estado: EstadoSprint.CERRADO,
              tareasPlanificadas: 5,
              tareasCompletadas: 3,
              porcentajeCumplimiento: 60,
              hitosTotales: 1,
              hitosCompletados: 0,
            },
          ],
        },
      });

      const { resumen } = renderProjectReportPdf(modelo, [
        makeBurndown({ idSprint: 1 }),
        makeBurndown({ idSprint: 2 }),
      ]);

      expect(resumen.textosRenderizados.some((t) => t.includes('Sprint 1') && t.includes('story points'))).toBe(
        true,
      );
      expect(resumen.textosRenderizados.some((t) => t.includes('Sprint 2') && t.includes('story points'))).toBe(
        true,
      );
    });

    it('el burndown nunca menciona al Sprint activo (solo llegan sprints cerrados desde el caller)', () => {
      const modelo = makeModelo({
        avance: {
          idProyecto: 5,
          sprints: [
            {
              idSprint: 1,
              numero: 1,
              estado: EstadoSprint.CERRADO,
              tareasPlanificadas: 4,
              tareasCompletadas: 4,
              porcentajeCumplimiento: 100,
              hitosTotales: 1,
              hitosCompletados: 1,
            },
            {
              idSprint: 2,
              numero: 2,
              estado: EstadoSprint.ACTIVO,
              tareasPlanificadas: 3,
              tareasCompletadas: 1,
              porcentajeCumplimiento: 33,
              hitosTotales: 0,
              hitosCompletados: 0,
            },
          ],
        },
      });

      // El caller (ExportsController) es quien filtra a solo CERRADO; aquí
      // se verifica que el render nunca imprime un burndown para un idSprint
      // que no vino en `burndowns`, aunque exista en `avance.sprints`.
      const { resumen } = renderProjectReportPdf(modelo, [makeBurndown({ idSprint: 1 })]);

      expect(resumen.textosRenderizados.some((t) => t.includes('Sprint 1') && t.includes('story points'))).toBe(
        true,
      );
      expect(resumen.textosRenderizados.some((t) => t.includes('Sprint 2') && t.includes('story points'))).toBe(
        false,
      );
    });
  });
});
