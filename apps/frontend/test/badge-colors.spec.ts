import { describe, expect, it } from 'vitest';
import { getHabilidadBadgeStyle, getSemestreBadgeStyle } from '@/lib/social/badge-colors';

describe('lib/social/badge-colors', () => {
  it('getSemestreBadgeStyle es determinista para el mismo semestre', () => {
    expect(getSemestreBadgeStyle(5)).toBe(getSemestreBadgeStyle(5));
  });

  it('getSemestreBadgeStyle cicla la paleta (semestres que difieren en 4 caen en el mismo color)', () => {
    expect(getSemestreBadgeStyle(1)).toBe(getSemestreBadgeStyle(5));
  });

  it('getHabilidadBadgeStyle es determinista para la misma habilidad', () => {
    expect(getHabilidadBadgeStyle('React')).toBe(getHabilidadBadgeStyle('React'));
  });

  it('getHabilidadBadgeStyle da colores distintos a habilidades distintas (al menos en general)', () => {
    const colores = new Set(
      ['React', 'Python', 'Figma', 'Go', 'Kotlin', 'Rust', 'SQL', 'Java'].map(getHabilidadBadgeStyle),
    );
    expect(colores.size).toBeGreaterThan(1);
  });
});
