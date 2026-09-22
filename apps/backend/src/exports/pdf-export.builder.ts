import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatFechaCsv } from './csv-export.util';
import { formatEstadoParticipacion, formatTipoProyecto } from './project-export-labels';
import { drawBurndownChart } from './burndown-chart.builder';
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
const BURNDOWN_BLOCK_ALTO_ESTIMADO = 190;

/**
 * T-260: sección de avance — tabla desde `SprintComparativeAnalyticsDto`
 * (distribución de tareas/hitos por Sprint, SIN velocity ni puntos de
 * historia como métrica de esta tabla — restricción vigente de HU-143). El
 * burndown va en su propia sección aparte (ver `buildBurndownSection` más
 * abajo), aislado a propósito desde que este archivo se escribió sin el
 * burndown disponible todavía en esta rama.
 */
function buildAvanceSection(
  doc: jsPDF,
  modelo: ProjectExportModel,
  startY: number,
  textosRenderizados: string[],
): void {
  autoTable(doc, {
    startY,
    head: [[...AVANCE_HEADER]],
    body: modelo.avance.sprints.map((sprint) => [
      `Sprint ${sprint.numero}`,
      sprint.estado,
      String(sprint.tareasPlanificadas),
      String(sprint.tareasCompletadas),
      `${sprint.porcentajeCumplimiento}%`,
    ]),
    styles: { font: PROJECT_REPORT_FONT, fontSize: 9 },
    headStyles: { font: PROJECT_REPORT_FONT, fontStyle: 'normal' },
    showHead: 'everyPage',
    margin: MARGEN,
  });
  for (const sprint of modelo.avance.sprints) {
    textosRenderizados.push(`Sprint ${sprint.numero}`, String(sprint.porcentajeCumplimiento));
  }
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
  textosRenderizados: string[],
): void {
  const alturaNecesaria = 20 + (burndowns.length === 0 ? 20 : BURNDOWN_BLOCK_ALTO_ESTIMADO);
  let y = startY;
  if (y + alturaNecesaria > A4_HEIGHT_PT - MARGEN.bottom) {
    doc.addPage();
    y = MARGEN.top + 16;
  }

  doc.setFontSize(13);
  doc.text('Burndown de Sprints cerrados', 40, y);
  textosRenderizados.push('Burndown de Sprints cerrados');
  y += 20;

  if (burndowns.length === 0) {
    const nota = 'El burndown estará disponible en este reporte cuando se cierre el primer Sprint del proyecto.';
    doc.setFontSize(9);
    doc.text(nota, 40, y);
    textosRenderizados.push(nota);
    return;
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
}

export function renderProjectReportPdf(modelo: ProjectExportModel, burndowns: SprintBurndownDto[]): PdfRenderResult {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  doc.addFileToVFS(FONT_FILE, fontBase64());
  doc.addFont(FONT_FILE, PROJECT_REPORT_FONT, 'normal');
  doc.setFont(PROJECT_REPORT_FONT, 'normal');

  const textosRenderizados: string[] = [];
  const escribir = (texto: string, x: number, y: number, tamano: number) => {
    doc.setFontSize(tamano);
    doc.text(texto, x, y);
    textosRenderizados.push(texto);
  };

  // T-260: encabezado con nombre del proyecto y fecha de generación, para
  // que el documento se explique solo sin depender de la pantalla que lo
  // generó. Nada aquí depende del color (blanco y negro legible).
  const fechaTexto = formatFechaCsv(modelo.fechaGeneracion);
  escribir(`Reporte del proyecto — ${modelo.proyecto.tituloProyecto}`, 40, 56, 16);
  escribir(`Generado: ${fechaTexto}`, 40, 74, 10);
  escribir(`Líder: ${modelo.lider.nombre} ${modelo.lider.apellido}`, 40, 92, 11);
  escribir(`Tipo de proyecto: ${formatTipoProyecto(modelo.proyecto.tipoProyecto)}`, 40, 108, 11);
  escribir(`Estado del proyecto: ${modelo.proyecto.estadoProyecto}`, 40, 124, 11);

  autoTable(doc, {
    startY: 144,
    head: [[...MIEMBROS_HEADER]],
    body: modelo.miembros.map((miembro) => [
      `${miembro.nombre} ${miembro.apellido}`,
      miembro.rol,
      formatEstadoParticipacion(miembro.estadoParticipacion),
      miembro.horasConfirmadas.toFixed(2),
      miembro.horasPendientes.toFixed(2),
    ]),
    styles: { font: PROJECT_REPORT_FONT, fontSize: 9 },
    headStyles: { font: PROJECT_REPORT_FONT, fontStyle: 'normal' },
    showHead: 'everyPage',
    margin: MARGEN,
  });
  for (const miembro of modelo.miembros) {
    textosRenderizados.push(
      `${miembro.nombre} ${miembro.apellido}`,
      miembro.horasConfirmadas.toFixed(2),
      miembro.horasPendientes.toFixed(2),
    );
  }

  const finalYMiembros = (doc as unknown as DocConAutoTable).lastAutoTable?.finalY ?? 144;
  const avanceStartY = finalYMiembros + 40;
  escribir('Avance por Sprint', 40, avanceStartY - 16, 13);
  buildAvanceSection(doc, modelo, avanceStartY, textosRenderizados);

  const avanceFinalY = (doc as unknown as DocConAutoTable).lastAutoTable?.finalY ?? avanceStartY;
  buildBurndownSection(doc, modelo, burndowns, avanceFinalY + 36, textosRenderizados);

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
      filasMiembros: modelo.miembros.length,
      fechaGeneracion: fechaTexto,
      textosRenderizados,
    },
  };
}
