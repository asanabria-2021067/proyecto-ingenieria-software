import { describe, expect, it } from 'vitest';
import { MODALIDAD_ESTILO, MODALIDADES_EN_ORDEN } from '@/lib/calendar/modalidad';

describe('calendar/modalidad (HU-184)', () => {
  it('cubre las tres modalidades del backend con etiqueta e ícono distintos', () => {
    expect(MODALIDADES_EN_ORDEN).toEqual(['PRESENCIAL', 'VIRTUAL', 'MIXTA']);
    const iconos = MODALIDADES_EN_ORDEN.map((m) => MODALIDAD_ESTILO[m].icon);
    expect(new Set(iconos).size).toBe(3);
    for (const modalidad of MODALIDADES_EN_ORDEN) {
      expect(MODALIDAD_ESTILO[modalidad].label).not.toBe('');
    }
  });

  it('MIXTA se muestra como "Híbrida", como en la maqueta', () => {
    expect(MODALIDAD_ESTILO.MIXTA.label).toBe('Híbrida');
  });
});
