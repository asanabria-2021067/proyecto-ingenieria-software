import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ClosureReportModelV1, ClosureReportContext } from './closure-report-model';

/**
 * C111 (06 v2 §28): render del informe de cierre en el proceso de Node.
 *
 * Todo ocurre DENTRO del backend: no hay navegador, ni headless, ni una sola
 * petición de red durante el render. La fuente Unicode se carga del asset
 * versionado del repositorio, de modo que un nombre con acentos o en otro
 * alfabeto se dibuja igual en cualquier despliegue y sin depender de que una
 * CDN responda.
 *
 * El render es una función del MODELO CANÓNICO: no vuelve a consultar nada y
 * no decide qué mostrar. Ajustar la representación o la paginación no puede
 * omitir una contribución, porque las filas provienen del modelo completo.
 */

/** Nombre lógico de la fuente embebida dentro del PDF. */
export const CLOSURE_REPORT_FONT = 'NotoSans';
const FONT_FILE = 'NotoSans-Regular.ttf';
const ASSETS_DIR = join(__dirname, 'assets');

/** A4 en puntos, la unidad con la que se construye el documento. */
export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;

const CONTRIBUCION_HEADER = [
  'Tarea',
  'Estado',
  'Integrante',
  'Origen',
  'Reportadas',
  'Ajuste',
  'Eliminada',
] as const;

export interface ClosureRenderSummary {
  paginas: number;
  filasContribucion: number;
  /** Encabezado dibujado en CADA página de la tabla; su repetición es el contrato. */
  encabezadoPorPagina: string[][];
  fechaGeneracion: string;
  /** Texto tal como se entregó al documento, para verificar que nada se sustituyó. */
  textosRenderizados: string[];
}

export interface ClosureRenderResult {
  pdf: Buffer;
  resumen: ClosureRenderSummary;
}

interface FilaContribucion {
  idAsignacion: number;
  tarea: string;
  estado: string;
  integrante: string;
  origen: string;
  reportadas: string;
  ajuste: string;
  eliminada: boolean;
}

@Injectable()
export class ProjectClosureReportService {
  private fuenteBase64: string | null = null;

  /** La fuente se lee del disco una vez por proceso; nunca de una URL. */
  private fontBase64(): string {
    if (this.fuenteBase64 === null) {
      this.fuenteBase64 = readFileSync(join(ASSETS_DIR, FONT_FILE)).toString('base64');
    }
    return this.fuenteBase64;
  }

  /**
   * Aplana el modelo en filas de contribución. Las tareas ELIMINADAS aportan
   * sus tramos igual que las vivas: su trabajo existió y el informe de cierre
   * es justamente donde no puede desaparecer.
   */
  private filasDeContribucion(modelo: ClosureReportModelV1): FilaContribucion[] {
    const nombrePorUsuario = new Map<number, string>();
    for (const participacion of modelo.participaciones) {
      const fila = participacion as { idUsuario: number; nombreRol: string };
      if (!nombrePorUsuario.has(fila.idUsuario)) {
        nombrePorUsuario.set(fila.idUsuario, fila.nombreRol);
      }
    }

    const filas: FilaContribucion[] = [];
    for (const tareaBruta of modelo.tareas) {
      const tarea = tareaBruta as unknown as {
        tituloTarea: string;
        estadoTarea: string;
        eliminada: boolean;
        tramos: Array<{
          idAsignacion: number;
          idUsuario: number;
          origenReporte: string;
          horasReportadas: string | null;
          ajustes: Array<{ deltaHoras: string | null; anuladoEn: string | null }>;
        }>;
      };
      for (const tramo of tarea.tramos) {
        const vigente = tramo.ajustes.find((ajuste) => ajuste.anuladoEn === null);
        filas.push({
          idAsignacion: tramo.idAsignacion,
          tarea: tarea.tituloTarea,
          estado: tarea.estadoTarea,
          integrante: nombrePorUsuario.get(tramo.idUsuario) ?? `Usuario ${tramo.idUsuario}`,
          origen: tramo.origenReporte,
          reportadas: tramo.horasReportadas ?? '0.00',
          ajuste: vigente?.deltaHoras ?? '—',
          eliminada: tarea.eliminada,
        });
      }
    }
    return filas;
  }

  /**
   * Renderiza el informe. `contexto.fechaGeneracion` es la ÚNICA fecha que se
   * escribe en los metadatos: usar `now()` haría que dos renders del mismo
   * modelo difirieran por el momento en que se ejecutaron.
   */
  render(modelo: ClosureReportModelV1, contexto: ClosureReportContext): ClosureRenderResult {
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    doc.addFileToVFS(FONT_FILE, this.fontBase64());
    doc.addFont(FONT_FILE, CLOSURE_REPORT_FONT, 'normal');
    doc.setFont(CLOSURE_REPORT_FONT, 'normal');

    const proyecto = modelo.proyecto as { tituloProyecto: string; idProyecto: number };
    const lider = modelo.lider as { nombre: string; apellido: string };
    const totales = modelo.totales as { horasReportadas: string; horasPropuestas: string };
    const textosRenderizados: string[] = [];
    const escribir = (texto: string, x: number, y: number, tamano: number) => {
      doc.setFontSize(tamano);
      doc.text(texto, x, y);
      textosRenderizados.push(texto);
    };

    escribir(`Informe de cierre — ${proyecto.tituloProyecto}`, 40, 56, 16);
    escribir(`Líder: ${lider.nombre} ${lider.apellido}`, 40, 78, 11);
    escribir(`Horas reportadas: ${totales.horasReportadas}`, 40, 94, 11);
    escribir(`Horas propuestas: ${totales.horasPropuestas}`, 40, 110, 11);
    escribir(`Variante: ${contexto.variante}`, 40, 126, 11);

    const filas = this.filasDeContribucion(modelo);
    const encabezadoPorPagina: string[][] = [];

    autoTable(doc, {
      startY: 146,
      head: [[...CONTRIBUCION_HEADER]],
      body: filas.map((fila) => [
        fila.tarea,
        fila.estado,
        fila.integrante,
        fila.origen,
        fila.reportadas,
        fila.ajuste,
        fila.eliminada ? 'Sí' : 'No',
      ]),
      styles: { font: CLOSURE_REPORT_FONT, fontSize: 8 },
      headStyles: { font: CLOSURE_REPORT_FONT, fontStyle: 'normal' },
      // La cabecera se repite en cada página: una tabla de cierre partida sin
      // encabezado deja de ser legible como evidencia.
      showHead: 'everyPage',
      margin: { top: 40, bottom: 40, left: 40, right: 40 },
      didDrawPage: (data) => {
        const cabecera = (data.table.head[0]?.cells ?? {}) as Record<string, { text: string[] }>;
        encabezadoPorPagina.push(Object.values(cabecera).map((celda) => celda.text.join(' ')));
      },
    });

    for (const fila of filas) {
      textosRenderizados.push(fila.tarea, fila.integrante);
    }

    // Metadatos con la fecha FIJA del contexto de generación.
    const fecha = new Date(contexto.fechaGeneracion);
    doc.setProperties({
      title: `Informe de cierre ${proyecto.idProyecto}`,
      subject: contexto.variante,
      creator: 'UVGenius',
      author: `${lider.nombre} ${lider.apellido}`,
    });
    doc.setCreationDate(fecha);

    return {
      pdf: Buffer.from(doc.output('arraybuffer')),
      resumen: {
        paginas: doc.getNumberOfPages(),
        filasContribucion: filas.length,
        encabezadoPorPagina,
        fechaGeneracion: contexto.fechaGeneracion,
        textosRenderizados,
      },
    };
  }
}
