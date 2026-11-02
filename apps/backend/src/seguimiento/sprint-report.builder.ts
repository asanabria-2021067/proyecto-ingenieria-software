import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { buildCsvFromRows } from '../exports/csv-export.util';
import { FONT_FILE, PROJECT_REPORT_FONT, fontBase64 } from '../exports/pdf-export.builder';

export interface ModeloReporteSprint {
  proyecto: string;
  sprint: { numero: number; estado: string; fechaInicio: string; fechaFinPlaneada: string | null; fechaCierre: string | null };
  resumen: {
    tareasPlanificadas: number;
    tareasCompletadas: number;
    porcentajeCumplimiento: number;
    puntosPlanificados: number;
    puntosCompletados: number;
  };
  /** Aviso cuando el detalle no cubre todo lo planificado (Sprint CERRADO cuyas tareas se arrastraron). */
  notaDetalle: string | null;
  tareas: Array<{
    titulo: string;
    estado: string;
    prioridad: string;
    puntos: number | null;
    responsable: string;
    horas: number;
    fechaLimite: string | null;
    hito: string;
  }>;
  integrantes: Array<{ nombre: string; tareasHechas: number; horas: number }>;
  retrospectiva: { quePaso: string; quePodriaMejorar: string; acuerdos: string } | null;
  generadoEn: string;
}

const TAREAS_HEADER = ['Tarea', 'Estado', 'Prioridad', 'Puntos', 'Responsable', 'Horas', 'Fecha límite', 'Hito'];
const INTEGRANTES_HEADER = ['Integrante', 'Tareas hechas', 'Horas'];

const filaTarea = (t: ModeloReporteSprint['tareas'][number]) => [
  t.titulo,
  t.estado,
  t.prioridad,
  t.puntos ?? '',
  t.responsable,
  t.horas,
  t.fechaLimite ?? '',
  t.hito,
];

const dmy = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '');

export function buildSprintReportCsv(m: ModeloReporteSprint): string {
  const r = m.resumen;
  return buildCsvFromRows([
    ['Proyecto', m.proyecto],
    ['Sprint', m.sprint.numero],
    ['Estado', m.sprint.estado],
    ['Inicio', dmy(m.sprint.fechaInicio)],
    ['Fin planeado', dmy(m.sprint.fechaFinPlaneada)],
    ['Cierre', dmy(m.sprint.fechaCierre)],
    ['Tareas planificadas', r.tareasPlanificadas],
    ['Tareas completadas', r.tareasCompletadas],
    ['Cumplimiento (%)', r.porcentajeCumplimiento],
    ['Puntos planificados', r.puntosPlanificados],
    ['Puntos completados', r.puntosCompletados],
    ...(m.notaDetalle ? [['Nota', m.notaDetalle]] : []),
    [],
    TAREAS_HEADER,
    ...m.tareas.map((t) => filaTarea({ ...t, fechaLimite: t.fechaLimite ? dmy(t.fechaLimite) : null })),
    [],
    INTEGRANTES_HEADER,
    ...m.integrantes.map((i) => [i.nombre, i.tareasHechas, i.horas]),
    ...(m.retrospectiva
      ? [
          [],
          ['Retrospectiva'],
          ['Qué pasó', m.retrospectiva.quePaso],
          ['Qué podría mejorar', m.retrospectiva.quePodriaMejorar],
          ['Acuerdos', m.retrospectiva.acuerdos],
        ]
      : []),
  ]);
}

export function renderSprintReportPdf(m: ModeloReporteSprint): Buffer {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  doc.addFileToVFS(FONT_FILE, fontBase64());
  doc.addFont(FONT_FILE, PROJECT_REPORT_FONT, 'normal');
  doc.setFont(PROJECT_REPORT_FONT, 'normal');
  const margin = { top: 40, bottom: 40, left: 40, right: 40 };
  const tabla = (startY: number, head: string[], body: (string | number)[][]) => {
    autoTable(doc, {
      startY,
      head: [head],
      body: body.map((fila) => fila.map(String)),
      styles: { font: PROJECT_REPORT_FONT, fontSize: 8 },
      headStyles: { font: PROJECT_REPORT_FONT, fontStyle: 'normal' },
      showHead: 'everyPage',
      margin,
    });
    return ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY) + 24;
  };

  const r = m.resumen;
  doc.setFontSize(16);
  doc.text(`Reporte del Sprint ${m.sprint.numero} - ${m.proyecto}`, 40, 44);
  doc.setFontSize(9);
  doc.text(
    `Estado: ${m.sprint.estado}   Inicio: ${dmy(m.sprint.fechaInicio)}   Fin planeado: ${dmy(m.sprint.fechaFinPlaneada) || '-'}   Cierre: ${dmy(m.sprint.fechaCierre) || '-'}`,
    40,
    62,
  );
  doc.text(
    `Tareas: ${r.tareasCompletadas}/${r.tareasPlanificadas} (${r.porcentajeCumplimiento}%)   Puntos: ${r.puntosCompletados}/${r.puntosPlanificados}   Generado: ${dmy(m.generadoEn)}`,
    40,
    76,
  );

  if (m.notaDetalle) doc.text(m.notaDetalle, 40, 90);
  let y = tabla(m.notaDetalle ? 104 : 90, TAREAS_HEADER, m.tareas.map(filaTarea));
  y = tabla(y, INTEGRANTES_HEADER, m.integrantes.map((i) => [i.nombre, i.tareasHechas, i.horas]));
  if (m.retrospectiva) {
    tabla(y, ['Retrospectiva', ''], [
      ['Qué pasó', m.retrospectiva.quePaso],
      ['Qué podría mejorar', m.retrospectiva.quePodriaMejorar],
      ['Acuerdos', m.retrospectiva.acuerdos],
    ]);
  }
  doc.setProperties({ title: `Reporte Sprint ${m.sprint.numero}`, creator: 'UVGenius' });
  return Buffer.from(doc.output('arraybuffer'));
}
