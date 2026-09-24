import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatFechaCsv } from './csv-export.util';
import { formatEstadoParticipacion, formatTipoProyecto } from './project-export-labels';
import { drawBurndownChart } from './burndown-chart.builder';
import { drawBarChart, drawPieChart, ALTO_BARRAS_ESTIMADO, ALTO_PASTEL_ESTIMADO } from './pdf-charts.builder';
import {
  DEFAULT_EXPORT_OPTIONS,
  colorTablaRgb,
  tamanosDeFuente,
  type ExportOptions,
  type GraficaExport,
  type SeccionExport,
} from './export-options';
import type { ProjectExportModel } from './dto/project-export.dto';
import type { SprintBurndownDto } from '../sprints/dto/sprint-burndown.dto';

/**
 * T-260 (HU-164): render del reporte de proyecto EN EL PROCESO de Node —
 * mismo patrón que project-closure-report.service.ts (nunca un navegador
 * headless, nunca una petición de red durante el render), con la fuente
 * Unicode embebida del mismo asset (copiado a exports/assets/ para que este
 * módulo no dependa de project-closure) para que un nombre con acentos o
 * una ñ se vea igual en cualquier despliegue.
 */
export const PROJECT_REPORT_FONT = 'NotoSans';
const FONT_FILE = 'NotoSans-Regular.ttf';
const ASSETS_DIR = join(__dirname, 'assets');

let fuenteBase64Cache: string | null = null;
function fontBase64(): string {
  if (fuenteBase64Cache === null) {
    fuenteBase64Cache = readFileSync(join(ASSETS_DIR, FONT_FILE)).toString('base64');
  }
  return fuenteBase64Cache;
}

export interface PdfRenderSummary {
  paginas: number;
  filasMiembros: number;
  fechaGeneracion: string;
  /** Líneas de la portada (página 1), en el orden en que se dibujan. */
  textosPortada: string[];
  /** Opciones aplicadas — permiten verificar que lo elegido llegó al documento. */
  tamanoTabla: number;
  colorTablasRgb: [number, number, number];
  seccionesRenderizadas: SeccionExport[];
  graficasRenderizadas: GraficaExport[];
  /** Texto tal como se entregó al documento, para verificar que nada se sustituyó (mismo contrato que ClosureRenderSummary). */
  textosRenderizados: string[];
}

export interface PdfRenderResult {
  pdf: Buffer;
  resumen: PdfRenderSummary;
}

interface DocConAutoTable {
  lastAutoTable?: { finalY: number };
}

const MIEMBROS_HEADER = ['Integrante', 'Rol', 'Estado', 'Horas confirmadas', 'Horas pendientes'] as const;
const AVANCE_HEADER = ['Sprint', 'Estado', 'Tareas planificadas', 'Tareas completadas', '% cumplimiento'] as const;
const MARGEN = { top: 40, bottom: 40, left: 40, right: 40 };
const A4_HEIGHT_PT = 841.89;
const A4_WIDTH_PT = 595.28;
const BURNDOWN_BLOCK_ALTO_ESTIMADO = 190;

/**
 * Portada (revisión del PR): página 1 con tres líneas centradas — Sprint X,
 * Proyecto XXXX y "Reporte de Analíticas" — y el resto del reporte desde la
 * página 2. Sin Sprint que mostrar se omite solo esa línea.
 */
function drawPortada(doc: jsPDF, modelo: ProjectExportModel, textosRenderizados: string[]): string[] {
  const centro = A4_WIDTH_PT / 2;
  const ancho = A4_WIDTH_PT - 2 * MARGEN.left - 40;
  const lineas: Array<{ texto: string; tamano: number }> = [];
  if (modelo.sprintPortada !== null) {
    lineas.push({ texto: `Sprint ${modelo.sprintPortada}`, tamano: 32 });
  }
  lineas.push({ texto: `Proyecto ${modelo.proyecto.tituloProyecto}`, tamano: 24 });
  lineas.push({ texto: 'Reporte de Analíticas', tamano: 20 });

  doc.setDrawColor(60);
  doc.setLineWidth(1.5);
  doc.line(MARGEN.left + 40, 300, A4_WIDTH_PT - MARGEN.right - 40, 300);

  let y = 350;
  for (const { texto, tamano } of lineas) {
    doc.setFontSize(tamano);
    const partes: string[] = doc.splitTextToSize(texto, ancho);
    doc.text(partes, centro, y, { align: 'center' });
    y += partes.length * tamano * 1.2 + 24;
    textosRenderizados.push(texto);
  }

  doc.line(MARGEN.left + 40, y, A4_WIDTH_PT - MARGEN.right - 40, y);
  doc.setFontSize(10);
  const generado = `Generado: ${formatFechaCsv(modelo.fechaGeneracion)}`;
  doc.text(generado, centro, y + 28, { align: 'center' });
  return lineas.map((l) => l.texto);
}

/**
 * T-260 (HU-164, decisión del líder de proyecto, 2026-09-22): mientras el
 * proyecto no tenga NINGÚN Sprint cerrado, `burndowns` llega vacío
 * (ExportsController ni siquiera lo consulta) y esta sección se limita a
 * avisar que el burndown no está disponible todavía — nunca dibuja un
 * gráfico vacío ni el burndown en vivo del Sprint activo. Apenas se cierra
 * el primer Sprint, se imprime el burndown de TODOS los Sprints cerrados
 * (nunca el activo, que sigue cambiando día a día).
 */
function buildBurndownSection(
  doc: jsPDF,
  modelo: ProjectExportModel,
  burndowns: SprintBurndownDto[],
  startY: number,
  tamanoSeccion: number,
  textosRenderizados: string[],
): number {
  const alturaNecesaria = 20 + (burndowns.length === 0 ? 20 : BURNDOWN_BLOCK_ALTO_ESTIMADO);
  let y = startY;
  if (y + alturaNecesaria > A4_HEIGHT_PT - MARGEN.bottom) {
    doc.addPage();
    y = MARGEN.top + 16;
  }

  doc.setFontSize(tamanoSeccion);
  doc.text('Burndown de Sprints cerrados', 40, y);
  textosRenderizados.push('Burndown de Sprints cerrados');
  y += 20;

  if (burndowns.length === 0) {
    const nota = 'El burndown estará disponible en este reporte cuando se cierre el primer Sprint del proyecto.';
    doc.setFontSize(9);
    doc.text(nota, 40, y);
    textosRenderizados.push(nota);
    return y + 20;
  }

  const numeroPorSprint = new Map(modelo.avance.sprints.map((sprint) => [sprint.idSprint, sprint.numero]));
  for (const burndown of burndowns) {
    if (y + BURNDOWN_BLOCK_ALTO_ESTIMADO > A4_HEIGHT_PT - MARGEN.bottom) {
      doc.addPage();
      y = MARGEN.top + 16;
    }
    const numero = numeroPorSprint.get(burndown.idSprint) ?? burndown.idSprint;
    const resultado = drawBurndownChart(doc, numero, burndown, y);
    textosRenderizados.push(...resultado.textosRenderizados);
    y = resultado.finalY + 20;
  }
  return y;
}

export function renderProjectReportPdf(
  modelo: ProjectExportModel,
  burndowns: SprintBurndownDto[],
  opciones: ExportOptions = DEFAULT_EXPORT_OPTIONS,
): PdfRenderResult {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  doc.addFileToVFS(FONT_FILE, fontBase64());
  doc.addFont(FONT_FILE, PROJECT_REPORT_FONT, 'normal');
  doc.setFont(PROJECT_REPORT_FONT, 'normal');

  const tam = tamanosDeFuente(opciones.fuente);
  const colorTablas = colorTablaRgb(opciones.colorTablas);
  const textosRenderizados: string[] = [];
  const escribir = (texto: string, x: number, yTexto: number, tamano: number) => {
    doc.setFontSize(tamano);
    doc.text(texto, x, yTexto);
    textosRenderizados.push(texto);
  };
  let y = 0;
  const asegurarEspacio = (alto: number) => {
    if (y + alto > A4_HEIGHT_PT - MARGEN.bottom) {
      doc.addPage();
      y = MARGEN.top + 16;
    }
  };
  const tabla = (head: readonly string[], body: string[][]) => {
    autoTable(doc, {
      startY: y,
      head: [[...head]],
      body,
      styles: { font: PROJECT_REPORT_FONT, fontSize: tam.tabla },
      headStyles: { font: PROJECT_REPORT_FONT, fontStyle: 'normal', fillColor: colorTablas, textColor: 255 },
      showHead: 'everyPage',
      margin: MARGEN,
    });
    y = ((doc as unknown as DocConAutoTable).lastAutoTable?.finalY ?? y) + 28;
  };

  const textosPortada = drawPortada(doc, modelo, textosRenderizados);
  doc.addPage();

  // T-260: encabezado con nombre del proyecto y fecha de generación, para
  // que el documento se explique solo sin depender de la pantalla que lo
  // generó. Nada aquí depende del color (blanco y negro legible).
  const fechaTexto = formatFechaCsv(modelo.fechaGeneracion);
  escribir(`Reporte del proyecto — ${modelo.proyecto.tituloProyecto}`, 40, 56, tam.titulo);
  escribir(`Generado: ${fechaTexto}`, 40, 74, tam.texto - 1);
  escribir(`Líder: ${modelo.lider.nombre} ${modelo.lider.apellido}`, 40, 92, tam.texto);
  escribir(`Tipo de proyecto: ${formatTipoProyecto(modelo.proyecto.tipoProyecto)}`, 40, 108, tam.texto);
  escribir(`Estado del proyecto: ${modelo.proyecto.estadoProyecto}`, 40, 124, tam.texto);
  y = 150;

  const secciones = opciones.secciones;
  const graficasRenderizadas: GraficaExport[] = [];

  if (secciones.includes('miembros')) {
    asegurarEspacio(60);
    escribir('Miembros y horas', 40, y, tam.seccion);
    y += 10;
    tabla(
      MIEMBROS_HEADER,
      modelo.miembros.map((miembro) => [
        `${miembro.nombre} ${miembro.apellido}`,
        miembro.rol,
        formatEstadoParticipacion(miembro.estadoParticipacion),
        miembro.horasConfirmadas.toFixed(2),
        miembro.horasPendientes.toFixed(2),
      ]),
    );
    for (const miembro of modelo.miembros) {
      textosRenderizados.push(
        `${miembro.nombre} ${miembro.apellido}`,
        miembro.horasConfirmadas.toFixed(2),
        miembro.horasPendientes.toFixed(2),
      );
    }

    // Las gráficas salen de los datos de esta sección: sin ella no hay qué graficar.
    if (opciones.graficas.includes('barras')) {
      asegurarEspacio(ALTO_BARRAS_ESTIMADO);
      const r = drawBarChart(doc, modelo.miembros, y, opciones.colorTablas);
      textosRenderizados.push(...r.textos);
      y = r.finalY + 16;
      graficasRenderizadas.push('barras');
    }
    if (opciones.graficas.includes('pastel')) {
      asegurarEspacio(ALTO_PASTEL_ESTIMADO);
      const r = drawPieChart(doc, modelo.miembros, y, opciones.colorTablas);
      textosRenderizados.push(...r.textos);
      y = r.finalY + 16;
      graficasRenderizadas.push('pastel');
    }
  }

  if (secciones.includes('avance')) {
    asegurarEspacio(60);
    escribir('Avance por Sprint', 40, y, tam.seccion);
    y += 10;
    tabla(
      AVANCE_HEADER,
      modelo.avance.sprints.map((sprint) => [
        `Sprint ${sprint.numero}`,
        sprint.estado,
        String(sprint.tareasPlanificadas),
        String(sprint.tareasCompletadas),
        `${sprint.porcentajeCumplimiento}%`,
      ]),
    );
    for (const sprint of modelo.avance.sprints) {
      textosRenderizados.push(`Sprint ${sprint.numero}`, String(sprint.porcentajeCumplimiento));
    }
  }

  if (secciones.includes('burndown')) {
    y = buildBurndownSection(doc, modelo, burndowns, y + 8, tam.seccion, textosRenderizados);
  }

  // Metadatos con la fecha FIJA de generación del modelo — nunca `now()` en
  // el render, para que dos renders del mismo modelo no difieran.
  doc.setProperties({
    title: `Reporte de proyecto ${modelo.proyecto.idProyecto}`,
    subject: 'Exportación de datos del proyecto (HU-164)',
    creator: 'UVGenius',
    author: `${modelo.lider.nombre} ${modelo.lider.apellido}`,
  });
  doc.setCreationDate(modelo.fechaGeneracion);

  return {
    pdf: Buffer.from(doc.output('arraybuffer')),
    resumen: {
      paginas: doc.getNumberOfPages(),
      filasMiembros: secciones.includes('miembros') ? modelo.miembros.length : 0,
      fechaGeneracion: fechaTexto,
      textosPortada,
      tamanoTabla: tam.tabla,
      colorTablasRgb: colorTablas,
      seccionesRenderizadas: [...secciones],
      graficasRenderizadas,
      textosRenderizados,
    },
  };
}
