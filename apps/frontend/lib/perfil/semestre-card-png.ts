import { etiquetaSemestre } from '@/lib/hours/semestre';
import type { ResumenSemestre } from '@/lib/services/perfil-portafolio';

const ANCHO = 1200;
const ALTO = 630;
const MARGEN = 64;

/** Colores del tema vigente (mismos tokens que la interfaz); si no existen, claros por defecto. */
function colores() {
  const css = getComputedStyle(document.documentElement);
  const token = (nombre: string, respaldo: string) => css.getPropertyValue(nombre).trim() || respaldo;
  return {
    fondo: token('--color-surface-container-lowest', '#ffffff'),
    texto: token('--color-on-surface', '#181c20'),
    suave: token('--color-tertiary', '#595959'),
    acento: token('--color-primary', '#006735'),
    linea: token('--color-outline-variant', '#bdcabd'),
  };
}

/** Texto de la tarjeta, sin datos privados (nada de correo, carné ni teléfono). Visible para pruebas. */
export function textosTarjeta(datos: ResumenSemestre, nombre: string) {
  return {
    titulo: 'MI SEMESTRE EN UVGENIUS',
    semestre: etiquetaSemestre(datos.semestre),
    nombre,
    cifras: [
      { valor: `${datos.horasAcreditadas} h`, etiqueta: 'Horas acreditadas' },
      { valor: String(datos.proyectos), etiqueta: datos.proyectos === 1 ? 'Proyecto' : 'Proyectos' },
      { valor: String(datos.tareasCompletadas), etiqueta: datos.tareasCompletadas === 1 ? 'Tarea completada' : 'Tareas completadas' },
      { valor: String(datos.reconocimientos), etiqueta: datos.reconocimientos === 1 ? 'Reconocimiento' : 'Reconocimientos' },
    ],
    insignias: datos.insignias.length > 0 ? `Insignias: ${datos.insignias.map((i) => i.nombre).join(', ')}` : 'Sin insignias nuevas este semestre',
  };
}

/** Dibuja la tarjeta en un canvas nativo (sin dependencias) y devuelve el PNG. */
export function crearTarjetaSemestrePng(datos: ResumenSemestre, nombre: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = ANCHO;
  canvas.height = ALTO;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('El navegador no permite generar la imagen'));
  const c = colores();
  const t = textosTarjeta(datos, nombre);
  const fuente = getComputedStyle(document.body).fontFamily || 'sans-serif';

  ctx.fillStyle = c.fondo;
  ctx.fillRect(0, 0, ANCHO, ALTO);
  ctx.fillStyle = c.acento;
  ctx.fillRect(0, 0, ANCHO, 16);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = c.acento;
  ctx.font = `700 30px ${fuente}`;
  ctx.fillText(t.titulo, MARGEN, 100);
  ctx.fillStyle = c.texto;
  ctx.font = `700 56px ${fuente}`;
  ctx.fillText(t.nombre, MARGEN, 176, ANCHO - MARGEN * 2);
  ctx.fillStyle = c.suave;
  ctx.font = `400 30px ${fuente}`;
  ctx.fillText(t.semestre, MARGEN, 222);

  const ancho = (ANCHO - MARGEN * 2) / t.cifras.length;
  t.cifras.forEach((cifra, i) => {
    const x = MARGEN + i * ancho;
    ctx.strokeStyle = c.linea;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, 280, ancho - 24, 170);
    ctx.fillStyle = c.acento;
    ctx.font = `800 64px ${fuente}`;
    ctx.fillText(cifra.valor, x + 24, 366, ancho - 72);
    ctx.fillStyle = c.suave;
    ctx.font = `400 24px ${fuente}`;
    ctx.fillText(cifra.etiqueta, x + 24, 416, ancho - 72);
  });

  ctx.fillStyle = c.texto;
  ctx.font = `400 28px ${fuente}`;
  ctx.fillText(t.insignias, MARGEN, 520, ANCHO - MARGEN * 2);
  ctx.fillStyle = c.suave;
  ctx.font = `400 24px ${fuente}`;
  ctx.fillText('UVGenius', MARGEN, ALTO - 40);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen'))), 'image/png'),
  );
}
