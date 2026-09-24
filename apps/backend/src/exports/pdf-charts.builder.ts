import type { jsPDF } from 'jspdf';
import { colorTablaRgb, type ColorTabla } from './export-options';
import type { ProjectExportMemberDto } from './dto/project-export.dto';

/**
 * Revisión del PR (HU-164): gráficas de los datos del reporte — barras y
 * pastel de las horas por integrante — dibujadas con primitivas vectoriales
 * de jsPDF (sin imágenes ni navegador headless, igual que el burndown). Nada
 * depende solo del color: las barras llevan su valor encima, y cada tajada
 * del pastel aparece en la leyenda con sus horas y su porcentaje.
 */
const LEFT = 40;
const ANCHO = 480;
const ALTO_BARRAS = 110;
const MAX_TAJADAS = 8;

/** Alto aproximado de cada bloque, para que el caller decida si cabe en la página. */
export const ALTO_BARRAS_ESTIMADO = 200;
export const ALTO_PASTEL_ESTIMADO = 190;

export interface ChartResult {
  finalY: number;
  textos: string[];
}

function mezclarConBlanco(rgb: [number, number, number], factor: number): [number, number, number] {
  return rgb.map((c) => Math.round(c + (255 - c) * factor)) as [number, number, number];
}

function nombreCompleto(miembro: ProjectExportMemberDto): string {
  return `${miembro.nombre} ${miembro.apellido}`;
}

function recortar(texto: string, max: number): string {
  return texto.length <= max ? texto : `${texto.slice(0, max - 1)}…`;
}

/** Porcentajes enteros que suman exactamente 100 (método del mayor residuo). */
function porcentajesQueSuman100(valores: number[]): number[] {
  const total = valores.reduce((a, b) => a + b, 0);
  const exactos = valores.map((v) => (v / total) * 100);
  const base = exactos.map(Math.floor);
  let faltan = 100 - base.reduce((a, b) => a + b, 0);
  const porResiduo = exactos
    .map((e, i) => ({ i, residuo: e - Math.floor(e) }))
    .sort((a, b) => b.residuo - a.residuo);
  for (const { i } of porResiduo) {
    if (faltan <= 0) break;
    base[i] += 1;
    faltan -= 1;
  }
  return base;
}

function escribir(doc: jsPDF, textos: string[], texto: string, x: number, y: number, tamano: number): void {
  doc.setFontSize(tamano);
  doc.text(texto, x, y);
  textos.push(texto);
}

export function drawBarChart(
  doc: jsPDF,
  miembros: ProjectExportMemberDto[],
  startY: number,
  color: ColorTabla,
): ChartResult {
  const textos: string[] = [];
  escribir(doc, textos, 'Horas por integrante', LEFT, startY, 11);

  if (miembros.length === 0) {
    escribir(doc, textos, 'Sin integrantes para graficar.', LEFT, startY + 16, 9);
    return { finalY: startY + 30, textos };
  }

  const maximo = Math.max(1, ...miembros.flatMap((m) => [m.horasConfirmadas, m.horasPendientes]));
  const top = startY + 24;
  const base = top + ALTO_BARRAS;
  const anchoGrupo = ANCHO / miembros.length;
  const anchoBarra = Math.min(22, anchoGrupo * 0.35);
  const [r, g, b] = colorTablaRgb(color);
  const [pr, pg, pb] = mezclarConBlanco([r, g, b], 0.75);

  doc.setDrawColor(90);
  doc.setLineWidth(0.75);
  doc.line(LEFT, top, LEFT, base);
  doc.line(LEFT, base, LEFT + ANCHO, base);
  doc.setFontSize(7);
  doc.text(String(Math.round(maximo * 100) / 100), LEFT - 4, top + 3, { align: 'right' });
  doc.text('0', LEFT - 4, base, { align: 'right' });

  miembros.forEach((miembro, i) => {
    const centro = LEFT + i * anchoGrupo + anchoGrupo / 2;
    const barras: Array<{ valor: number; x: number; relleno: [number, number, number] }> = [
      { valor: miembro.horasConfirmadas, x: centro - anchoBarra - 1, relleno: [r, g, b] },
      { valor: miembro.horasPendientes, x: centro + 1, relleno: [pr, pg, pb] },
    ];
    for (const barra of barras) {
      const alto = (barra.valor / maximo) * ALTO_BARRAS;
      doc.setFillColor(barra.relleno[0], barra.relleno[1], barra.relleno[2]);
      doc.setDrawColor(r, g, b);
      doc.setLineWidth(0.5);
      doc.rect(barra.x, base - alto, anchoBarra, alto, 'FD');
      doc.setFontSize(7);
      doc.text(String(Math.round(barra.valor * 100) / 100), barra.x + anchoBarra / 2, base - alto - 2, {
        align: 'center',
      });
    }
    escribir(doc, textos, recortar(nombreCompleto(miembro), Math.max(6, Math.floor(anchoGrupo / 4))), centro, base + 10, 7);
  });

  const leyendaY = base + 26;
  doc.setFillColor(r, g, b);
  doc.setDrawColor(r, g, b);
  doc.rect(LEFT, leyendaY - 6, 10, 8, 'FD');
  escribir(doc, textos, 'Horas confirmadas', LEFT + 14, leyendaY, 8);
  doc.setFillColor(pr, pg, pb);
  doc.rect(LEFT + 120, leyendaY - 6, 10, 8, 'FD');
  escribir(doc, textos, 'Horas pendientes', LEFT + 134, leyendaY, 8);

  return { finalY: leyendaY + 18, textos };
}

export function drawPieChart(
  doc: jsPDF,
  miembros: ProjectExportMemberDto[],
  startY: number,
  color: ColorTabla,
): ChartResult {
  const textos: string[] = [];
  escribir(doc, textos, 'Distribución de horas (confirmadas + pendientes)', LEFT, startY, 11);

  const conHoras = miembros
    .map((m) => ({ etiqueta: nombreCompleto(m), horas: m.horasConfirmadas + m.horasPendientes }))
    .filter((m) => m.horas > 0)
    .sort((a, b) => b.horas - a.horas);

  if (conHoras.length === 0) {
    escribir(doc, textos, 'Sin horas para graficar.', LEFT, startY + 16, 9);
    return { finalY: startY + 30, textos };
  }

  const tajadas =
    conHoras.length > MAX_TAJADAS
      ? [
          ...conHoras.slice(0, MAX_TAJADAS),
          { etiqueta: 'Otros', horas: conHoras.slice(MAX_TAJADAS).reduce((a, m) => a + m.horas, 0) },
        ]
      : conHoras;
  const total = tajadas.reduce((a, t) => a + t.horas, 0);
  const porcentajes = porcentajesQueSuman100(tajadas.map((t) => t.horas));

  const radio = 70;
  const cx = LEFT + radio + 10;
  const cy = startY + 24 + radio;
  const base = colorTablaRgb(color);
  let angulo = -Math.PI / 2;
  const limites: number[] = [];

  tajadas.forEach((tajada, i) => {
    const [r, g, b] = mezclarConBlanco(base, tajadas.length === 1 ? 0 : (0.7 * i) / (tajadas.length - 1));
    doc.setFillColor(r, g, b);
    // Borde del mismo color que el relleno: un borde blanco dibujaría las
    // costuras entre los triángulos del abanico como rayas radiales.
    doc.setDrawColor(r, g, b);
    doc.setLineWidth(0.4);
    const barrido = (tajada.horas / total) * 2 * Math.PI;
    const pasos = Math.max(2, Math.ceil(barrido / (Math.PI / 30)));
    for (let k = 0; k < pasos; k++) {
      const a1 = angulo + (barrido * k) / pasos;
      const a2 = angulo + (barrido * (k + 1)) / pasos;
      doc.triangle(
        cx,
        cy,
        cx + radio * Math.cos(a1),
        cy + radio * Math.sin(a1),
        cx + radio * Math.cos(a2),
        cy + radio * Math.sin(a2),
        'FD',
      );
    }
    limites.push(angulo);
    angulo += barrido;

    const ly = startY + 30 + i * 14;
    doc.setFillColor(r, g, b);
    doc.setDrawColor(base[0], base[1], base[2]);
    doc.rect(LEFT + 200, ly - 7, 9, 9, 'FD');
    doc.setDrawColor(255);
    escribir(
      doc,
      textos,
      `${recortar(tajada.etiqueta, 34)} — ${tajada.horas.toFixed(2)} h (${porcentajes[i]} %)`,
      LEFT + 214,
      ly,
      8,
    );
  });

  // Separadores blancos entre tajadas, al final para que ningún relleno
  // posterior los tape.
  if (tajadas.length > 1) {
    doc.setDrawColor(255);
    doc.setLineWidth(1.2);
    for (const limite of limites) {
      doc.line(cx, cy, cx + radio * Math.cos(limite), cy + radio * Math.sin(limite));
    }
  }

  const finalLeyenda = startY + 30 + tajadas.length * 14;
  return { finalY: Math.max(cy + radio, finalLeyenda) + 18, textos };
}
