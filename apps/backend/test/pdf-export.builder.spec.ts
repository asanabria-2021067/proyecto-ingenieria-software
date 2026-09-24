import { describe, expect, it } from 'vitest';
import { EstadoParticipacion, EstadoProyecto, EstadoSprint, TipoProyecto } from '@prisma/client';
import { renderProjectReportPdf } from '../src/exports/pdf-export.builder';
import type { ProjectExportModel } from '../src/exports/dto/project-export.dto';
import type { SprintBurndownDto } from '../src/sprints/dto/sprint-burndown.dto';
import { DEFAULT_EXPORT_OPTIONS, colorTablaRgb, type ExportOptions } from '../src/exports/export-options';

const opciones = (o: Partial<ExportOptions>): ExportOptions => ({ ...DEFAULT_EXPORT_OPTIONS, ...o });

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
    sprintPortada: 1,
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

describe('portada del PDF', () => {
  it('imprime en tres líneas centradas: Sprint X, Proyecto y Reporte de Analíticas', () => {
    const { resumen } = renderProjectReportPdf(makeModelo({ sprintPortada: 3 }), []);

    expect(resumen.textosPortada).toEqual([
      'Sprint 3',
      'Proyecto Sistema de Bibliotecas',
      'Reporte de Analíticas',
    ]);
  });

  it('sin sprint que mostrar omite la línea del Sprint y conserva las otras dos', () => {
    const { resumen } = renderProjectReportPdf(makeModelo({ sprintPortada: null }), []);

    expect(resumen.textosPortada).toEqual(['Proyecto Sistema de Bibliotecas', 'Reporte de Analíticas']);
  });

  it('el resto del reporte empieza en la segunda página: hay al menos 2 páginas y el encabezado va después de la portada', () => {
    const { resumen } = renderProjectReportPdf(makeModelo(), []);

    expect(resumen.paginas).toBeGreaterThanOrEqual(2);
    const iPortada = resumen.textosRenderizados.indexOf('Reporte de Analíticas');
    const iEncabezado = resumen.textosRenderizados.findIndex((t) => t.startsWith('Reporte del proyecto'));
    expect(iPortada).toBeGreaterThanOrEqual(0);
    expect(iEncabezado).toBeGreaterThan(iPortada);
  });
});

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

describe('opciones de exportación (revisión del PR)', () => {
  it('fuente: el tamaño de las tablas cambia con pequeña/mediana/grande', () => {
    const t = (fuente: ExportOptions['fuente']) =>
      renderProjectReportPdf(makeModelo(), [], opciones({ fuente })).resumen.tamanoTabla;

    expect(t('pequena')).toBeLessThan(t('mediana'));
    expect(t('mediana')).toBeLessThan(t('grande'));
    expect(t('mediana')).toBe(9);
  });

  it('color: las tablas usan el color elegido en el encabezado', () => {
    const { resumen } = renderProjectReportPdf(makeModelo(), [], opciones({ colorTablas: '#166534' }));

    expect(resumen.colorTablasRgb).toEqual([22, 101, 52]);
    expect(resumen.colorTablasRgb).toEqual(colorTablaRgb('#166534'));
  });

  it('color claro: el texto del encabezado pasa a negro para seguir siendo legible', () => {
    const { resumen } = renderProjectReportPdf(makeModelo(), [], opciones({ colorTablas: '#59f7ff' }));

    expect(resumen.colorTextoEncabezado).toBe(0);
    expect(renderProjectReportPdf(makeModelo(), [], opciones({ colorTablas: '#1e408c' })).resumen.colorTextoEncabezado).toBe(255);
  });

  it('secciones: solo miembros omite avance y burndown', () => {
    const { resumen } = renderProjectReportPdf(makeModelo(), [], opciones({ secciones: ['miembros'] }));

    expect(resumen.seccionesRenderizadas).toEqual(['miembros']);
    expect(resumen.textosRenderizados).not.toContain('Avance por Sprint');
    expect(resumen.textosRenderizados).not.toContain('Burndown de Sprints cerrados');
    expect(resumen.filasMiembros).toBe(1);
  });

  it('secciones: solo avance omite la tabla de miembros', () => {
    const { resumen } = renderProjectReportPdf(makeModelo(), [], opciones({ secciones: ['avance'] }));

    expect(resumen.seccionesRenderizadas).toEqual(['avance']);
    expect(resumen.filasMiembros).toBe(0);
    expect(resumen.textosRenderizados).toContain('Avance por Sprint');
    expect(resumen.textosRenderizados.some((t) => t.includes('12.50'))).toBe(false);
  });

  it('secciones: solo burndown con sprints cerrados imprime el gráfico', () => {
    const { resumen } = renderProjectReportPdf(makeModelo(), [makeBurndown()], opciones({ secciones: ['burndown'] }));

    expect(resumen.seccionesRenderizadas).toEqual(['burndown']);
    expect(resumen.textosRenderizados).toContain('Real');
    expect(resumen.textosRenderizados).not.toContain('Avance por Sprint');
  });

  it('gráficas: barras y pastel se imprimen cuando se piden y hay tabla de miembros', () => {
    const { resumen } = renderProjectReportPdf(makeModelo(), [], opciones({ graficas: ['barras', 'pastel'] }));

    expect(resumen.graficasRenderizadas).toEqual(['barras', 'pastel']);
    expect(resumen.textosRenderizados).toContain('Horas por integrante');
    expect(resumen.textosRenderizados.some((t) => t.startsWith('Distribución de horas'))).toBe(true);
  });

  it('gráficas: solo una de las dos cuando solo se pide esa', () => {
    const { resumen } = renderProjectReportPdf(makeModelo(), [], opciones({ graficas: ['pastel'] }));

    expect(resumen.graficasRenderizadas).toEqual(['pastel']);
    expect(resumen.textosRenderizados).not.toContain('Horas por integrante');
  });

  it('gráficas: sin la sección de miembros no hay datos que graficar, no se imprimen', () => {
    const { resumen } = renderProjectReportPdf(
      makeModelo(),
      [],
      opciones({ secciones: ['avance'], graficas: ['barras', 'pastel'] }),
    );

    expect(resumen.graficasRenderizadas).toEqual([]);
  });

  it('por defecto no hay gráficas y se imprime todo el contenido', () => {
    const { resumen } = renderProjectReportPdf(makeModelo(), []);

    expect(resumen.graficasRenderizadas).toEqual([]);
    expect(resumen.seccionesRenderizadas).toEqual(['miembros', 'avance', 'burndown']);
  });

  it('con muchos integrantes y ambas gráficas el reporte pagina sin fallar y crece en páginas', () => {
    const base = makeModelo();
    const muchos = Array.from({ length: 60 }, (_, i) => ({
      ...base.miembros[0],
      idUsuario: 100 + i,
      nombre: `Integrante${i}`,
      horasConfirmadas: i,
      horasPendientes: 1,
    }));

    const chico = renderProjectReportPdf(base, []).resumen.paginas;
    const grande = renderProjectReportPdf({ ...base, miembros: muchos }, [], opciones({ graficas: ['barras', 'pastel'] }));

    expect(grande.pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(grande.resumen.paginas).toBeGreaterThan(chico);
  });
});

