/**
 * Conversiones de color para el selector de color de la exportación
 * (RGB ↔ HSV ↔ hex `#rrggbb`). Funciones puras, sin DOM.
 */
export type Rgb = [number, number, number];
export interface Hsv {
  /** Matiz 0–360. */
  h: number;
  /** Saturación 0–1. */
  s: number;
  /** Brillo (valor) 0–1. */
  v: number;
}

const HEX = /^#?([0-9a-fA-F]{6})$/;

export function hexToRgb(hex: string): Rgb | null {
  const match = HEX.exec(hex);
  if (!match) {
    return null;
  }
  const n = match[1];
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)) as Rgb;
}

const canal = (c: number) => Math.min(255, Math.max(0, Math.round(c)));

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => canal(c).toString(16).padStart(2, '0')).join('')}`;
}

/** `#rrggbb` en minúsculas, o null si no es un hex completo de 6 dígitos. */
export function normalizarHex(hex: string): string | null {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHex(rgb) : null;
}

export function rgbToHsv([r, g, b]: Rgb): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const delta = max - Math.min(rn, gn, bn);
  let h = 0;
  if (delta !== 0) {
    if (max === rn) {
      h = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
      h = (bn - rn) / delta + 2;
    } else {
      h = (rn - gn) / delta + 4;
    }
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const hh = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
  return [canal((r + m) * 255), canal((g + m) * 255), canal((b + m) * 255)];
}
