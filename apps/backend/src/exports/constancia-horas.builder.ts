import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FONT_FILE, PROJECT_REPORT_FONT, fontBase64 } from './pdf-export.builder';

export interface DatosConstancia {
  nombre: string;
  carne: string;
  carrera: string | null;
  semestre: { anio: number; periodo: 1 | 2 };
  /** YYYY-MM-DD */
  emitida: string;
  filas: { proyecto: string; rol: string; tipo: 'beca' | 'extension'; horas: number; fecha: string }[];
}

const TIPO = { beca: 'Horas beca', extension: 'Horas de extensión' } as const;

const suma = (d: DatosConstancia, tipo: 'beca' | 'extension') =>
  d.filas.filter((f) => f.tipo === tipo).reduce((acc, f) => acc + f.horas, 0);

/** Constancia de horas acreditadas en UVGenius durante un semestre (no incluye lo declarado por el estudiante). */
export function renderConstanciaHorasPdf(d: DatosConstancia): Buffer {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.addFileToVFS(FONT_FILE, fontBase64());
  doc.addFont(FONT_FILE, PROJECT_REPORT_FONT, 'normal');
  doc.setFont(PROJECT_REPORT_FONT, 'normal');
  doc.setFontSize(16);
  doc.text('Constancia de horas acreditadas', 40, 50);
  doc.setFontSize(10);
  const semestre = `${d.semestre.periodo === 1 ? '1.er' : '2.º'} semestre ${d.semestre.anio}`;
  const lineas = [
    `Estudiante: ${d.nombre}`,
    `Carné: ${d.carne}${d.carrera ? `   Carrera: ${d.carrera}` : ''}`,
    `Periodo: ${semestre}`,
    `Emitida: ${d.emitida}`,
  ];
  lineas.forEach((l, i) => doc.text(l, 40, 76 + i * 15));
  autoTable(doc, {
    startY: 76 + lineas.length * 15 + 8,
    head: [['Proyecto', 'Rol', 'Tipo', 'Horas', 'Fecha de acreditación']],
    body: d.filas.map((f) => [f.proyecto, f.rol, TIPO[f.tipo], String(f.horas), f.fecha]),
    foot: [
      ['Total horas beca', '', '', String(suma(d, 'beca')), ''],
      ['Total horas de extensión', '', '', String(suma(d, 'extension')), ''],
    ],
    showFoot: 'lastPage',
    styles: { font: PROJECT_REPORT_FONT, fontSize: 9 },
    headStyles: { font: PROJECT_REPORT_FONT, fontStyle: 'normal' },
    footStyles: { font: PROJECT_REPORT_FONT, fontStyle: 'normal' },
    margin: { top: 40, bottom: 40, left: 40, right: 40 },
  });
  return Buffer.from(doc.output('arraybuffer'));
}
