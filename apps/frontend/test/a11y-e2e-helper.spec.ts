import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  IMPACTOS_BLOQUEANTES,
  TAGS_WCAG,
  describirViolaciones,
  normalizarViolaciones,
  violacionesBloqueantes,
  type ResultadoAxe,
} from '../e2e/support/a11y';

/** FG11-C01 (T-318). Helper de axe para la suite E2E: lo que decide sin necesidad de un navegador. */

const resultado = (parcial: Partial<ResultadoAxe> & Pick<ResultadoAxe, 'id'>): ResultadoAxe => ({
  impact: 'serious',
  help: 'Ayuda de la regla',
  tags: ['wcag2aa', 'wcag143', 'cat.color'],
  nodes: [{ target: ['.tarjeta > span'], failureSummary: 'Fix any of the following:\n  contraste 3.6:1' }],
  ...parcial,
});

describe('FG11-C01: dependencia y configuración', () => {
  const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(join(__dirname, '../package-lock.json'), 'utf8'));

  it('@axe-core/playwright es una dependencia de desarrollo con versión exacta', () => {
    expect(pkg.devDependencies['@axe-core/playwright']).toBe('4.10.2');
    expect(pkg.dependencies['@axe-core/playwright']).toBeUndefined();
  });

  it('el lockfile fija el adaptador y el mismo axe-core de la auditoría de T-316', () => {
    expect(lock.packages['node_modules/@axe-core/playwright'].version).toBe('4.10.2');
    expect(lock.packages['node_modules/@axe-core/playwright/node_modules/axe-core'].version).toBe('4.10.3');
    expect(lock.packages['node_modules/@axe-core/playwright'].dev).toBe(true);
  });

  it('usa las reglas WCAG 2.0 y 2.1 de nivel A y AA, y bloquea por impacto grave o crítico', () => {
    expect([...TAGS_WCAG]).toEqual(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
    expect([...IMPACTOS_BLOQUEANTES]).toEqual(['serious', 'critical']);
  });

  it('el helper no desactiva reglas ni excluye selectores', () => {
    const fuente = readFileSync(join(__dirname, '../e2e/support/a11y.ts'), 'utf8');
    expect(fuente).not.toMatch(/\.disableRules\(|\.exclude\(|\.options\(|rules:/);
    expect(fuente).toContain('.withTags([...TAGS_WCAG])');
  });
});

describe('FG11-C01: normalizarViolaciones', () => {
  it('conserva regla, impacto, criterios WCAG, selector y motivo', () => {
    expect(normalizarViolaciones([resultado({ id: 'color-contrast' })])).toEqual([
      {
        regla: 'color-contrast',
        impacto: 'serious',
        ayuda: 'Ayuda de la regla',
        wcag: ['wcag143'],
        nodos: [{ selector: '.tarjeta > span', resumen: 'Fix any of the following: contraste 3.6:1' }],
      },
    ]);
  });

  it('no arrastra el HTML del nodo ni otros campos de axe', () => {
    const [violacion] = normalizarViolaciones([
      { ...resultado({ id: 'label' }), nodes: [{ target: ['input'], failureSummary: 'x', html: '<input value="correo@uvg.edu.gt">' } as never] },
    ]);
    expect(JSON.stringify(violacion)).not.toContain('uvg.edu.gt');
    expect(Object.keys(violacion.nodos[0]).sort()).toEqual(['resumen', 'selector']);
  });

  it('une los selectores anidados (iframes, shadow DOM) y recorta resúmenes largos', () => {
    const [violacion] = normalizarViolaciones([
      resultado({ id: 'label', nodes: [{ target: ['iframe', ['#host', 'input']], failureSummary: 'x'.repeat(900) }] }),
    ]);
    expect(violacion.nodos[0].selector).toBe('iframe #host,input');
    expect(violacion.nodos[0].resumen).toHaveLength(300);
  });

  it('un impacto que axe no informa queda como «desconocido», no como leve', () => {
    expect(normalizarViolaciones([resultado({ id: 'regla-nueva', impact: null })])[0].impacto).toBe('desconocido');
    expect(normalizarViolaciones([resultado({ id: 'regla-nueva', impact: undefined })])[0].impacto).toBe('desconocido');
  });
});

describe('FG11-C01: violacionesBloqueantes', () => {
  const todas = normalizarViolaciones([
    resultado({ id: 'label', impact: 'critical' }),
    resultado({ id: 'color-contrast', impact: 'serious' }),
    resultado({ id: 'heading-order', impact: 'moderate' }),
    resultado({ id: 'region', impact: 'minor' }),
    resultado({ id: 'regla-nueva', impact: null }),
  ]);

  it('bloquean las críticas y las graves', () => {
    expect(violacionesBloqueantes(todas).map((v) => v.regla)).toEqual(['label', 'color-contrast', 'regla-nueva']);
  });

  it('las moderadas y menores no bloquean, pero siguen en el listado completo', () => {
    expect(todas.map((v) => v.regla)).toContain('heading-order');
    expect(violacionesBloqueantes(todas).map((v) => v.regla)).not.toContain('heading-order');
    expect(violacionesBloqueantes(todas).map((v) => v.regla)).not.toContain('region');
  });

  it('un impacto desconocido bloquea: nada se ignora en silencio', () => {
    expect(violacionesBloqueantes(todas).map((v) => v.impacto)).toContain('desconocido');
  });

  it('sin violaciones no hay nada que bloquee', () => {
    expect(violacionesBloqueantes([])).toEqual([]);
  });
});

describe('FG11-C01: describirViolaciones', () => {
  it('produce una línea accionable por violación', () => {
    const lineas = describirViolaciones(
      normalizarViolaciones([
        resultado({ id: 'color-contrast', nodes: [1, 2, 3, 4].map((n) => ({ target: [`.nodo-${n}`], failureSummary: 'x' })) }),
      ]),
    );
    expect(lineas).toEqual(['color-contrast [serious] wcag143 · 4 nodo(s): .nodo-1 | .nodo-2 | .nodo-3']);
  });

  it('una regla sin criterio WCAG lo dice', () => {
    expect(describirViolaciones(normalizarViolaciones([resultado({ id: 'region', tags: ['best-practice'] })]))[0]).toContain('sin criterio');
  });
});
