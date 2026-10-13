import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { analizarAccesibilidad, describirViolaciones } from './support/a11y';

/**
 * T-318 (FG11): la comprobación de accesibilidad FALLA cuando debe.
 *
 * Una puerta que nunca falla no protege nada. Aquí se le da a la misma función
 * que usa `accesibilidad.spec.ts` una página de prueba con violaciones graves
 * conocidas y se comprueba que las detecta; se corrigen y se comprueba que
 * pasa. Las páginas son HTML escrito en este archivo: no se toca la aplicación
 * ni se necesita sesión.
 *
 * Demostración del código de salida (manual, ver docs/qa/sprint9/accesibilidad-ci.md):
 *   A11Y_GATE_SELFTEST=fail npm run test:e2e:a11y   -> debe terminar con código distinto de 0
 */

const LIMPIA = `<!doctype html>
<html lang="es">
  <head><meta charset="utf-8"><title>Página de prueba accesible</title></head>
  <body style="background:#ffffff;color:#181c20">
    <main>
      <h1>Datos de contacto</h1>
      <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="Escudo de la universidad" width="24" height="24">
      <label for="nombre">Nombre</label>
      <input id="nombre" type="text">
      <p id="nota">Los campos se guardan al enviar.</p>
      <button type="button">Guardar</button>
    </main>
  </body>
</html>`;

/** La misma página con cuatro defectos graves o críticos, uno por regla. */
const DEFECTUOSA = LIMPIA.replace(' alt="Escudo de la universidad"', '')
  .replace('<label for="nombre">Nombre</label>', '<span>Nombre</span>')
  .replace('<p id="nota">', '<p id="nota" style="color:#b8b8b8">')
  .replace('<button type="button">Guardar</button>', '<button type="button"></button>');

const REGLAS_ESPERADAS = ['button-name', 'color-contrast', 'image-alt', 'label'];

async function cargar(page: Page, html: string) {
  await page.setContent(html, { waitUntil: 'load' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test.describe('T-318: la comprobación de accesibilidad falla cerrada', () => {
  test('una página accesible pasa sin violaciones bloqueantes', async ({ page }, testInfo) => {
    await cargar(page, LIMPIA);
    const { violaciones, bloqueantes } = await analizarAccesibilidad(page, testInfo, 'fixture-limpia');
    expect(describirViolaciones(bloqueantes)).toEqual([]);
    expect(violaciones).toEqual([]);
  });

  test('una página con defectos graves produce violaciones bloqueantes, una por regla', async ({ page }, testInfo) => {
    await cargar(page, DEFECTUOSA);
    const { bloqueantes } = await analizarAccesibilidad(page, testInfo, 'fixture-defectuosa');

    expect(bloqueantes.map((v) => v.regla).sort()).toEqual(REGLAS_ESPERADAS);
    for (const violacion of bloqueantes) {
      expect(['serious', 'critical'], violacion.regla).toContain(violacion.impacto);
      expect(violacion.wcag.length, `${violacion.regla} cita su criterio WCAG`).toBeGreaterThan(0);
      expect(violacion.nodos.length, violacion.regla).toBeGreaterThan(0);
      expect(violacion.nodos[0].selector).not.toBe('');
    }
    // El contraste es grave; las otras tres, críticas.
    expect(bloqueantes.find((v) => v.regla === 'color-contrast')?.impacto).toBe('serious');
    expect(bloqueantes.filter((v) => v.impacto === 'critical').map((v) => v.regla).sort()).toEqual(['button-name', 'image-alt', 'label']);

    // La afirmación de la puerta real, aplicada a esta página, NO se cumple.
    const lineas = describirViolaciones(bloqueantes);
    expect(lineas).toHaveLength(4);
    expect(() => expect(lineas).toEqual([])).toThrow();
  });

  test('un solo defecto grave basta para bloquear', async ({ page }, testInfo) => {
    await cargar(page, LIMPIA.replace('<p id="nota">', '<p id="nota" style="color:#b8b8b8">'));
    const { bloqueantes } = await analizarAccesibilidad(page, testInfo, 'fixture-solo-contraste');
    expect(bloqueantes.map((v) => `${v.regla}:${v.impacto}`)).toEqual(['color-contrast:serious']);
  });

  test('al corregir los defectos en la misma página, vuelve a pasar', async ({ page }, testInfo) => {
    await cargar(page, DEFECTUOSA);
    expect((await analizarAccesibilidad(page, testInfo, 'fixture-antes-de-corregir')).bloqueantes).toHaveLength(4);

    await page.evaluate(() => {
      document.querySelector('img')?.setAttribute('alt', 'Escudo de la universidad');
      const rotulo = document.querySelector('span');
      const etiqueta = document.createElement('label');
      etiqueta.htmlFor = 'nombre';
      etiqueta.textContent = 'Nombre';
      rotulo?.replaceWith(etiqueta);
      (document.getElementById('nota') as HTMLElement).style.color = '';
      (document.querySelector('button') as HTMLElement).textContent = 'Guardar';
    });

    const { bloqueantes } = await analizarAccesibilidad(page, testInfo, 'fixture-corregida');
    expect(describirViolaciones(bloqueantes)).toEqual([]);
  });

  test('el análisis se adjunta al reporte sin el HTML de la página', async ({ page }, testInfo) => {
    await cargar(page, DEFECTUOSA);
    await analizarAccesibilidad(page, testInfo, 'fixture-evidencia');
    const adjunto = testInfo.attachments.find((a) => a.name === 'a11y-fixture-evidencia.json');
    expect(adjunto?.contentType).toBe('application/json');
    const cuerpo = JSON.parse((adjunto?.body as Buffer).toString('utf8'));
    expect(cuerpo.violaciones.map((v: { regla: string }) => v.regla).sort()).toEqual(REGLAS_ESPERADAS);
    expect(cuerpo.reglasEvaluadas).toBeGreaterThan(10);
    expect(cuerpo.motor.name).toBe('axe-core');
    expect(JSON.stringify(cuerpo)).not.toContain('<img');
    expect(JSON.stringify(cuerpo)).not.toContain('data:image');
  });
});

// Autoprueba del código de salida. Solo existe cuando se pide de forma explícita: aplica la
// afirmación de la puerta real a la página defectuosa y, por tanto, DEBE fallar y dejar el
// comando en rojo. No forma parte de la suite normal ni de CI.
if (process.env.A11Y_GATE_SELFTEST === 'fail') {
  test('AUTOPRUEBA (debe fallar): la puerta rechaza una página con violaciones graves', async ({ page }, testInfo) => {
    await cargar(page, DEFECTUOSA);
    const { bloqueantes } = await analizarAccesibilidad(page, testInfo, 'autoprueba');
    expect(describirViolaciones(bloqueantes), 'violaciones graves o críticas').toEqual([]);
  });
}
