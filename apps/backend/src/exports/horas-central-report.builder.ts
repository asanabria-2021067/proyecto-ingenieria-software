import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { buildCsv } from './csv-export.util';
import { FONT_FILE, PROJECT_REPORT_FONT, fontBase64 } from './pdf-export.builder';

/** Fila de horas de un estudiante en un semestre; la reutilizan la vista central del admin y los reportes de asociacion. */
export interface FilaReporteHoras {
  nombre: string;
  apellido: string;
  carne: string;
  carrera: string | null;
  metaBeca: number | null;
  becaDeclarada: number;
  becaAcreditada: number;
  faltaBeca: number | null;
  metaExtension: number | null;
  extensionDeclarada: number;
  extensionAcreditada: number;
  faltaExtension: number | null;
  enRiesgo: boolean;
}

const HEADER = [
  'Nombre',
  'Carné',
  'Carrera',
  'Meta beca',
  'Beca declaradas',
  'Beca acreditadas',
  'Falta beca',
  'Meta extensión',
  'Extensión declaradas',
  'Extensión acreditadas',
  'Falta extensión',
  'En riesgo',
] as const;

const celda = (n: number | null) => (n === null ? '' : n);

const SIN_METAS = 'Aún no registra sus metas del semestre';

const filaTabla = (f: FilaReporteHoras) => [
  `${f.nombre} ${f.apellido}`,
  f.carne,
  f.carrera ?? '',
  f.metaBeca === null && f.metaExtension === null ? SIN_METAS : celda(f.metaBeca),
  f.becaDeclarada,
  f.becaAcreditada,
  celda(f.faltaBeca),
  celda(f.metaExtension),
  f.extensionDeclarada,
  f.extensionAcreditada,
  celda(f.faltaExtension),
  f.enRiesgo ? 'Sí' : 'No',
];

export const buildHorasCsv = (filas: FilaReporteHoras[]) => buildCsv([...HEADER], filas.map(filaTabla));

export function renderTablaPdf(titulo: string, head: readonly string[], body: (string | number)[][]): Buffer {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  doc.addFileToVFS(FONT_FILE, fontBase64());
  doc.addFont(FONT_FILE, PROJECT_REPORT_FONT, 'normal');
  doc.setFont(PROJECT_REPORT_FONT, 'normal');
  doc.setFontSize(14);
  doc.text(titulo, 40, 40);
  autoTable(doc, {
    startY: 56,
    head: [[...head]],
    body: body.map((fila) => fila.map(String)),
    styles: { font: PROJECT_REPORT_FONT, fontSize: 8 },
    headStyles: { font: PROJECT_REPORT_FONT, fontStyle: 'normal' },
    showHead: 'everyPage',
    margin: { top: 40, bottom: 40, left: 40, right: 40 },
  });
  return Buffer.from(doc.output('arraybuffer'));
}

export const renderHorasPdf = (titulo: string, filas: FilaReporteHoras[]) =>
  renderTablaPdf(titulo, HEADER, filas.map(filaTabla));
