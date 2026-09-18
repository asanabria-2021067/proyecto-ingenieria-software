import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatFechaCsv } from './csv-export.util';
import { formatEstadoParticipacion, formatTipoProyecto } from './project-export-labels';
import type { ProjectExportModel } from './dto/project-export.dto';

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

/**
 * T-260: sección de avance aislada a propósito. Hoy compone la tabla desde
 * `SprintComparativeAnalyticsDto` (distribución de tareas/hitos por Sprint,
 * SIN velocity ni puntos de historia — restricción vigente de HU-143). El
 * burndown (T-240, rama feature/graficos-burndown-velocidad) todavía no
 * existe en esta rama; cuando se fusione, el punto de extensión es esta
 * función — agregar su gráfico aquí no debería tocar el resto del render.
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

export function renderProjectReportPdf(modelo: ProjectExportModel): PdfRenderResult {
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
