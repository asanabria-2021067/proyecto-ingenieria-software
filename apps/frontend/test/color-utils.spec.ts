import { describe, expect, it } from 'vitest';
import { hexToRgb, hsvToRgb, normalizarHex, rgbToHex, rgbToHsv } from '../lib/color';

describe('hexToRgb', () => {
  it('convierte #RRGGBB (mayúsculas o minúsculas) a RGB', () => {
    expect(hexToRgb('#59F7FF')).toEqual([89, 247, 255]);
    expect(hexToRgb('#59f7ff')).toEqual([89, 247, 255]);
  });

  it('acepta el hex sin el signo #', () => {
    expect(hexToRgb('1e408c')).toEqual([30, 64, 140]);
  });

  it.each(['', '#12345', '#1234567', '#GGGGGG', 'azul', '#12 456'])('devuelve null para "%s"', (valor) => {
    expect(hexToRgb(valor)).toBeNull();
  });
});

describe('rgbToHex', () => {
  it('convierte a #rrggbb en minúsculas con ceros a la izquierda', () => {
    expect(rgbToHex([89, 247, 255])).toBe('#59f7ff');
    expect(rgbToHex([0, 5, 10])).toBe('#00050a');
  });

  it('acota valores fuera de 0–255 y redondea', () => {
    expect(rgbToHex([-4, 300, 127.6])).toBe('#00ff80');
  });
});

describe('normalizarHex', () => {
  it('devuelve #rrggbb en minúsculas o null si no es un hex completo', () => {
    expect(normalizarHex('59F7FF')).toBe('#59f7ff');
    expect(normalizarHex('#59F7')).toBeNull();
  });
});

describe('rgbToHsv / hsvToRgb', () => {
  it('rojo, verde, azul, blanco y negro', () => {
    expect(rgbToHsv([255, 0, 0])).toEqual({ h: 0, s: 1, v: 1 });
    expect(rgbToHsv([0, 255, 0])).toEqual({ h: 120, s: 1, v: 1 });
    expect(rgbToHsv([0, 0, 255])).toEqual({ h: 240, s: 1, v: 1 });
    expect(rgbToHsv([255, 255, 255])).toEqual({ h: 0, s: 0, v: 1 });
    expect(rgbToHsv([0, 0, 0])).toEqual({ h: 0, s: 0, v: 0 });
  });

  it('hsvToRgb es la inversa en los puntos conocidos', () => {
    expect(hsvToRgb({ h: 0, s: 1, v: 1 })).toEqual([255, 0, 0]);
    expect(hsvToRgb({ h: 120, s: 1, v: 1 })).toEqual([0, 255, 0]);
    expect(hsvToRgb({ h: 240, s: 1, v: 1 })).toEqual([0, 0, 255]);
    expect(hsvToRgb({ h: 200, s: 0, v: 1 })).toEqual([255, 255, 255]);
    expect(hsvToRgb({ h: 200, s: 0.5, v: 0 })).toEqual([0, 0, 0]);
  });

  it('ida y vuelta conserva el color (el celeste de la referencia)', () => {
    expect(hsvToRgb(rgbToHsv([89, 247, 255]))).toEqual([89, 247, 255]);
    expect(hsvToRgb(rgbToHsv([30, 64, 140]))).toEqual([30, 64, 140]);
  });

  it('h = 360 equivale a h = 0', () => {
    expect(hsvToRgb({ h: 360, s: 1, v: 1 })).toEqual([255, 0, 0]);
  });
});
