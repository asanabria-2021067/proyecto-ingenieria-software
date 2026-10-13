import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';

/**
 * T-318 — comprobación de accesibilidad con axe dentro de la suite E2E.
 *
 * Reglas: las etiquetadas WCAG 2.0 y 2.1, niveles A y AA (las mismas de la
 * auditoría de T-316). Bloquean el test las violaciones de impacto `serious` o
 * `critical`; las `moderate` y `minor` se adjuntan como evidencia sin romper.
 * No hay lista de exclusiones: ninguna regla se desactiva ni se excluye ningún
 * selector.
 *
 * `accesibilidad.ts` (misma carpeta) mide contraste y objetivos táctiles a
 * mano; este módulo es el que ejecuta axe.
 */

export const TAGS_WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const;
export const IMPACTOS_BLOQUEANTES = ['serious', 'critical'] as const;

export interface ViolacionA11y {
  regla: string;
  impacto: string;
  ayuda: string;
  /** Criterios WCAG de la regla, p. ej. `wcag143`. */
  wcag: string[];
  nodos: { selector: string; resumen: string }[];
}

/** Lo mínimo de un resultado de axe que usa este módulo (permite probarlo sin navegador). */
export interface ResultadoAxe {
  id: string;
  impact?: string | null;
  help: string;
  tags: string[];
  nodes: { target: unknown[]; failureSummary?: string }[];
}

/**
 * Forma estable y sin datos de sesión: regla, impacto, criterios y, por nodo,
 * su selector y el motivo. No se guarda el HTML del nodo, que puede traer
 * texto de la cuenta con la que corre la prueba.
 */
export function normalizarViolaciones(resultados: readonly ResultadoAxe[]): ViolacionA11y[] {
  return resultados.map((resultado) => ({
    regla: resultado.id,
    impacto: resultado.impact ?? 'desconocido',
    ayuda: resultado.help,
    wcag: resultado.tags.filter((tag) => /^wcag\d+$/.test(tag)),
    nodos: resultado.nodes.map((nodo) => ({
      selector: nodo.target.map(String).join(' '),
      resumen: (nodo.failureSummary ?? '').replace(/\s+/g, ' ').trim().slice(0, 300),
    })),
  }));
}

/** Violaciones que rompen el test. Un impacto que axe no informa se trata como bloqueante: nunca se ignora en silencio. */
export function violacionesBloqueantes(violaciones: readonly ViolacionA11y[]): ViolacionA11y[] {
  return violaciones.filter(
    (violacion) => (IMPACTOS_BLOQUEANTES as readonly string[]).includes(violacion.impacto) || violacion.impacto === 'desconocido',
  );
}

/** Una línea por violación, para que el fallo del test diga qué arreglar sin abrir el adjunto. */
export function describirViolaciones(violaciones: readonly ViolacionA11y[]): string[] {
  return violaciones.map(
    (violacion) =>
      `${violacion.regla} [${violacion.impacto}] ${violacion.wcag.join(',') || 'sin criterio'} · ${violacion.nodos.length} nodo(s): ${violacion.nodos
        .slice(0, 3)
        .map((nodo) => nodo.selector)
        .join(' | ')}`,
  );
}

export interface AnalisisA11y {
  violaciones: ViolacionA11y[];
  bloqueantes: ViolacionA11y[];
}

/**
 * Ejecuta axe sobre la página y adjunta el resultado al reporte de Playwright
 * como `a11y-<nombre>.json`. El llamador decide qué afirmar; lo habitual es
 * `expect(describirViolaciones(bloqueantes)).toEqual([])`.
 */
export async function analizarAccesibilidad(page: Page, testInfo: TestInfo, nombre: string): Promise<AnalisisA11y> {
  const resultado = await new AxeBuilder({ page }).withTags([...TAGS_WCAG]).analyze();
  const violaciones = normalizarViolaciones(resultado.violations as ResultadoAxe[]);
  const bloqueantes = violacionesBloqueantes(violaciones);
  await testInfo.attach(`a11y-${nombre}.json`, {
    contentType: 'application/json',
    body: JSON.stringify(
      {
        nombre,
        ruta: new URL(page.url()).pathname,
        motor: resultado.testEngine,
        tags: TAGS_WCAG,
        reglasEvaluadas: resultado.passes.length + resultado.violations.length + resultado.incomplete.length,
        violaciones,
        sinDecidir: resultado.incomplete.map((regla) => ({ regla: regla.id, nodos: regla.nodes.length })),
      },
      null,
      2,
    ),
  });
  return { violaciones, bloqueantes };
}
