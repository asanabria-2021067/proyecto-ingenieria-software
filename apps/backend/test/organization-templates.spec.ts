import { describe, expect, it } from 'vitest';
import { listarPlantillas } from '../src/organizations/organization-templates';

describe('plantillas de organización (MEJ-156)', () => {
  it('ofrece Club, Voluntariado, Investigación y Otro', () => {
    expect(listarPlantillas().map((p) => p.clave)).toEqual(['CLUB', 'VOLUNTARIADO', 'INVESTIGACION', 'OTRO']);
  });

  it('cada plantilla tiene etiqueta y solo sugiere descripción, que cabe en el límite', () => {
    for (const p of listarPlantillas()) {
      expect(Object.keys(p).sort()).toEqual(['clave', 'descripcion', 'etiqueta']);
      expect(p.etiqueta.length).toBeGreaterThan(0);
      expect(p.descripcion.length).toBeLessThanOrEqual(2000);
    }
  });

  it('Club, Voluntariado e Investigación sugieren texto; Otro lo deja vacío', () => {
    const por = Object.fromEntries(listarPlantillas().map((p) => [p.clave, p.descripcion]));
    expect(por.CLUB).not.toBe('');
    expect(por.VOLUNTARIADO).not.toBe('');
    expect(por.INVESTIGACION).not.toBe('');
    expect(por.OTRO).toBe('');
  });
});
