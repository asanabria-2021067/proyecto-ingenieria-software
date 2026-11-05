import { describe, expect, it } from 'vitest';
import { AYUDA_POR_ROL, ROLES_AYUDA, buscarAyuda } from '@/content/ayuda';

const todas = ROLES_AYUDA.flatMap((rol) => AYUDA_POR_ROL[rol]);

describe('MEJ-86 contenido del centro de ayuda', () => {
  it('tiene los cinco roles', () => {
    expect([...ROLES_AYUDA]).toEqual(['estudiante', 'lider', 'junta', 'coordinador', 'admin']);
    expect(Object.keys(AYUDA_POR_ROL).sort()).toEqual([...ROLES_AYUDA].sort());
  });

  it.each(ROLES_AYUDA)('el rol %s tiene al menos 6 preguntas', (rol) => {
    expect(AYUDA_POR_ROL[rol].length).toBeGreaterThanOrEqual(6);
  });

  it('los ids son únicos en todo el contenido y llevan el prefijo de su rol', () => {
    const ids = todas.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rol of ROLES_AYUDA) {
      expect(AYUDA_POR_ROL[rol].every((p) => p.id.startsWith(`${rol}-`))).toBe(true);
    }
  });

  it('cada pregunta tiene texto, no repite pregunta dentro del rol y sus rutas son del dashboard', () => {
    for (const rol of ROLES_AYUDA) {
      const preguntas = AYUDA_POR_ROL[rol].map((p) => p.pregunta);
      expect(new Set(preguntas).size).toBe(preguntas.length);
    }
    for (const p of todas) {
      expect(p.pregunta.trim().length).toBeGreaterThan(10);
      expect(p.respuesta.trim().length).toBeGreaterThan(40);
      expect(p.pregunta).toMatch(/^¿.*\?$/);
      if (p.ruta) expect(p.ruta).toMatch(/^\/dashboard(\/[a-z-]+)*$/);
    }
  });

  it('el texto va sin guiones largos', () => {
    for (const p of todas) {
      expect(`${p.pregunta}${p.respuesta}`).not.toMatch(/[–—“”‘’]/);
    }
  });
});

describe('MEJ-86 búsqueda de ayuda', () => {
  const estudiante = AYUDA_POR_ROL.estudiante;

  it('sin texto devuelve todo', () => {
    expect(buscarAyuda(estudiante, '   ')).toEqual(estudiante);
  });

  it('ignora tildes y mayúsculas', () => {
    const ids = buscarAyuda(estudiante, 'EXTENSION').map((p) => p.id);
    expect(ids).toContain('estudiante-horas-semestre');
  });

  it('exige todas las palabras', () => {
    expect(buscarAyuda(estudiante, 'postulo proyecto').map((p) => p.id)).toContain('estudiante-postular-proyecto');
    expect(buscarAyuda(estudiante, 'postulo zzzxyz')).toEqual([]);
  });
});
