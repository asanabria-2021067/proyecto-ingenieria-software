import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODALIDAD_ESTILO, MODALIDADES_EN_ORDEN } from '@/lib/calendar/modalidad';

const CSS = readFileSync(join(__dirname, '..', 'app', 'global.css'), 'utf8');

/** Valor declarado de un token (`--color-x: valor;`), primera aparición. */
function valorToken(nombre: string): string | null {
  const match = new RegExp(`^\\s*--color-${nombre}:\\s*([^;]+);`, 'm').exec(CSS);
  return match ? match[1].trim() : null;
}

describe('calendar/modalidad (HU-184 T-324)', () => {
  it('cubre las tres modalidades del backend con etiqueta e ícono', () => {
    expect(MODALIDADES_EN_ORDEN).toEqual(['PRESENCIAL', 'VIRTUAL', 'MIXTA']);
    for (const modalidad of MODALIDADES_EN_ORDEN) {
      expect(MODALIDAD_ESTILO[modalidad].label).not.toBe('');
      expect(MODALIDAD_ESTILO[modalidad].icon).toBeDefined();
    }
  });

  it('cada modalidad usa un token de color definido en global.css y distinto de los otros', () => {
    const valores = MODALIDADES_EN_ORDEN.map((modalidad) => {
      const token = MODALIDAD_ESTILO[modalidad].punto.replace(/^bg-/, '');
      const valor = valorToken(token);
      expect(valor, `--color-${token} no está definido`).not.toBeNull();
      return valor;
    });
    // accent y status-warning apuntan al mismo color: dos modalidades no
    // pueden compartir valor aunque usen nombres de token distintos.
    expect(new Set(valores).size).toBe(valores.length);
  });

  it('el relleno siempre trae su color de texto on-*', () => {
    for (const modalidad of MODALIDADES_EN_ORDEN) {
      expect(MODALIDAD_ESTILO[modalidad].relleno).toMatch(/\btext-on-/);
    }
  });
});
