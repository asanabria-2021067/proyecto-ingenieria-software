#!/usr/bin/env node
// T-316 · Auditoría de accesibilidad con Lighthouse y axe sobre las cinco
// pantallas principales, en tema claro y oscuro, con sesión autenticada.
//
//   node scripts/qa/sprint9-a11y-audit.mjs --out <carpeta externa> [--tag baseline]
//        [--base http://localhost:3100] [--api http://localhost:3101]
//
// Mide; no corrige ni modifica la aplicación. Debe correr contra la pila E2E
// aislada (scripts/e2e/isolated-stack.sh), que sirve el build de producción con
// cuentas sintéticas: nunca contra datos reales.
//
// Herramientas: Playwright sale de apps/frontend. axe-core y Lighthouse NO son
// dependencias del repositorio; se toman de A11Y_TOOLS_DIR, un directorio
// externo con versiones fijadas:
//   mkdir -p "$A11Y_TOOLS_DIR" && cd "$A11Y_TOOLS_DIR" && npm init -y \
//     && npm install --save-exact axe-core@4.10.3 lighthouse@12.6.1
//
// Los informes (JSON y capturas) se escriben SOLO en --out, que debe estar
// fuera del repositorio. No guardan cookies ni tokens.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? porDefecto : process.argv[i + 1];
};
const fail = (mensaje) => {
  console.error(`sprint9-a11y-audit: ${mensaje}`);
  process.exit(2);
};

const BASE = arg('base', process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3100');
const API = arg('api', process.env.E2E_API_URL ?? 'http://localhost:3101');
const TAG = arg('tag', 'baseline');
const OUT = arg('out');
const TOOLS = process.env.A11Y_TOOLS_DIR;
const PASSWORD = process.env.A11Y_PASSWORD ?? 'Test1234!';
const PUERTO_DEPURACION = Number(process.env.A11Y_DEBUG_PORT ?? 9333);

if (!OUT) fail('falta --out <carpeta externa>');
if (!TOOLS) fail('define A11Y_TOOLS_DIR (ver la cabecera de este archivo)');
const salida = path.resolve(OUT, TAG);
const relativa = path.relative(REPO, salida);
if (!relativa.startsWith('..') && !path.isAbsolute(relativa)) fail('--out debe estar fuera del repositorio');
// Solo la pila local: las mediciones inician sesión y no deben apuntar a un entorno real.
for (const url of [BASE, API]) {
  if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) fail(`${url} no es local`);
}

/** Las cinco pantallas, con la cuenta sintética que las usa (ver docs/qa/sprint9/a11y-screen-inventory.md). */
export const PANTALLAS = [
  { id: 'dashboard-estudiante', ruta: '/dashboard', rol: 'estudiante', listo: 'main h1' },
  { id: 'dashboard-admin', ruta: '/dashboard/admin', rol: 'admin', listo: 'main h1' },
  { id: 'proyectos-admin', ruta: '/dashboard/admin/proyectos?grupo=activos', rol: 'admin', listo: 'main h1' },
  { id: 'calendario', ruta: '/dashboard/calendario', rol: 'estudiante', listo: 'main h1' },
  { id: 'perfil-editar', ruta: '/dashboard/perfil/editar', rol: 'estudiante', listo: 'main h1' },
];
const CUENTAS = { estudiante: 'carlos.mendoza@uvg.edu.gt', admin: 'admin@uvg.edu.gt' };
const TEMAS = ['claro', 'oscuro'];
const TAGS_WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const desdeFrontend = createRequire(path.join(REPO, 'apps/frontend/package.json'));
const desdeHerramientas = createRequire(path.join(TOOLS, 'package.json'));
const { chromium } = desdeFrontend('playwright');
const axePath = desdeHerramientas.resolve('axe-core/axe.min.js');
const axeVersion = desdeHerramientas('axe-core/package.json').version;
const lighthouseVersion = desdeHerramientas('lighthouse/package.json').version;
const { default: lighthouse } = await import(pathToFileURL(desdeHerramientas.resolve('lighthouse')).href);

fs.mkdirSync(salida, { recursive: true });
const escribir = (nombre, datos) => fs.writeFileSync(path.join(salida, nombre), JSON.stringify(datos, null, 2));

/** Recorrido observacional con Tab: paradas, foco visible y si el foco queda atrapado. */
async function recorrerConTeclado(page, maximo = 40) {
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  const paradas = [];
  for (let i = 0; i < maximo; i += 1) {
    await page.keyboard.press('Tab');
    const parada = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const estilo = getComputedStyle(el);
      const caja = el.getBoundingClientRect();
      return {
        etiqueta: el.tagName.toLowerCase(),
        rol: el.getAttribute('role'),
        nombre: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 50),
        focoVisible: estilo.outlineStyle !== 'none' && parseFloat(estilo.outlineWidth) > 0 ? true : estilo.boxShadow !== 'none',
        enPantalla: caja.width > 0 && caja.height > 0,
        clave: `${el.tagName}|${el.id}|${el.getAttribute('aria-label') ?? ''}|${(el.textContent ?? '').trim().slice(0, 30)}|${Math.round(caja.x)}|${Math.round(caja.y)}`,
      };
    });
    if (!parada) break;
    paradas.push(parada);
  }
  const distintas = new Set(paradas.map((p) => p.clave)).size;
  return {
    paradas: paradas.length,
    distintas,
    sinFocoVisible: paradas.filter((p) => !p.focoVisible).map((p) => `${p.etiqueta}${p.rol ? `[${p.rol}]` : ''} «${p.nombre}»`),
    sinNombre: paradas.filter((p) => !p.nombre).map((p) => `${p.etiqueta}${p.rol ? `[${p.rol}]` : ''}`),
    // Menos de tres paradas distintas en un recorrido largo: el foco da vueltas en el mismo sitio.
    posibleTrampa: paradas.length >= 10 && distintas < 3,
    primeras: paradas.slice(0, 12).map((p) => `${p.etiqueta}${p.rol ? `[${p.rol}]` : ''} «${p.nombre}»`),
  };
}

async function medirRol(rol) {
  const perfil = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? '/tmp'), 'a11y-perfil-'));
  const contexto = await chromium.launchPersistentContext(perfil, {
    headless: true,
    viewport: { width: 1440, height: 900 },
    locale: 'es-GT',
    timezoneId: 'America/Guatemala',
    args: [`--remote-debugging-port=${PUERTO_DEPURACION}`],
  });
  const resultados = [];
  try {
    const page = contexto.pages()[0] ?? (await contexto.newPage());
    // El tour de bienvenida tapa la pantalla la primera vez: se marca como visto.
    await contexto.addInitScript(() => {
      const original = Storage.prototype.getItem;
      Storage.prototype.getItem = function getItem(clave) {
        return typeof clave === 'string' && clave.startsWith('onboarding_seen_') ? 'true' : original.call(this, clave);
      };
    });
    const acceso = await contexto.request.post(`${API}/api/auth/login`, { data: { correo: CUENTAS[rol], contrasena: PASSWORD } });
    if (acceso.status() !== 201) throw new Error(`inicio de sesión de ${rol}: ${acceso.status()}`);

    for (const pantalla of PANTALLAS.filter((p) => p.rol === rol)) {
      for (const tema of TEMAS) {
        const id = `${pantalla.id}-${tema}`;
        await page.goto(`${BASE}/login`);
        await page.evaluate((valor) => localStorage.setItem('theme', valor), tema === 'oscuro' ? 'dark' : 'light');
        await page.goto(`${BASE}${pantalla.ruta}`, { waitUntil: 'networkidle' });
        await page.waitForSelector(pantalla.listo, { timeout: 30_000 });
        await page.waitForTimeout(500);
        const estado = await page.evaluate(() => ({
          url: location.pathname + location.search,
          oscuro: document.documentElement.classList.contains('dark'),
          titulo: document.title,
          h1: document.querySelector('main h1')?.textContent?.trim() ?? null,
        }));
        if (estado.oscuro !== (tema === 'oscuro')) throw new Error(`${id}: el tema aplicado no es ${tema}`);
        if (estado.url !== pantalla.ruta) throw new Error(`${id}: la sesión terminó en ${estado.url}`);

        // --- axe ---------------------------------------------------------
        await page.addScriptTag({ path: axePath });
        const axe = await page.evaluate(
          (tags) => window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations', 'incomplete'] }),
          TAGS_WCAG,
        );
        const violaciones = axe.violations.map((v) => ({
          regla: v.id,
          impacto: v.impact,
          ayuda: v.help,
          wcag: v.tags.filter((t) => /^wcag\d/.test(t)),
          nodos: v.nodes.map((n) => ({ selector: n.target.join(' '), resumen: n.failureSummary, html: n.html.slice(0, 200) })),
        }));
        escribir(`${id}.axe.json`, { pantalla: pantalla.id, ruta: pantalla.ruta, tema, estado, version: axeVersion, tags: TAGS_WCAG, violaciones, incompletas: axe.incomplete.map((v) => ({ regla: v.id, impacto: v.impact, nodos: v.nodes.length })) });
        await page.screenshot({ path: path.join(salida, `${id}.png`) });

        // --- teclado (observacional) --------------------------------------
        const teclado = await recorrerConTeclado(page);
        escribir(`${id}.teclado.json`, { pantalla: pantalla.id, tema, ...teclado });

        // --- Lighthouse (misma sesión y mismo tema: no borra el almacenamiento) ---
        const lh = await lighthouse(
          `${BASE}${pantalla.ruta}`,
          { port: PUERTO_DEPURACION, output: 'json', logLevel: 'error', onlyCategories: ['accessibility'], disableStorageReset: true },
          { extends: 'lighthouse:default', settings: { formFactor: 'desktop', screenEmulation: { disabled: true }, throttlingMethod: 'provided', locale: 'es' } },
        );
        const lhr = lh.lhr;
        const fallidas = Object.values(lhr.audits)
          .filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode !== 'notApplicable' && a.scoreDisplayMode !== 'manual')
          .map((a) => ({ id: a.id, titulo: a.title, elementos: (a.details?.items ?? []).map((item) => item.node?.selector).filter(Boolean) }));
        if (new URL(lhr.finalDisplayedUrl).pathname !== new URL(`${BASE}${pantalla.ruta}`).pathname) {
          throw new Error(`${id}: Lighthouse midió ${lhr.finalDisplayedUrl} (¿sesión perdida?)`);
        }
        escribir(`${id}.lighthouse.json`, { pantalla: pantalla.id, ruta: pantalla.ruta, tema, version: lighthouseVersion, urlFinal: lhr.finalDisplayedUrl, puntuacion: Math.round((lhr.categories.accessibility.score ?? 0) * 100), fallidas });

        const porImpacto = (impacto) => violaciones.filter((v) => v.impacto === impacto).length;
        resultados.push({
          pantalla: pantalla.id,
          ruta: pantalla.ruta,
          tema,
          h1: estado.h1,
          lighthouse: Math.round((lhr.categories.accessibility.score ?? 0) * 100),
          lighthouseFallidas: fallidas.map((f) => f.id),
          axe: { critical: porImpacto('critical'), serious: porImpacto('serious'), moderate: porImpacto('moderate'), minor: porImpacto('minor'), nodos: violaciones.reduce((n, v) => n + v.nodos.length, 0) },
          axeReglas: violaciones.map((v) => `${v.regla}(${v.impacto},${v.nodos.length})`),
          teclado: { paradas: teclado.paradas, distintas: teclado.distintas, sinFocoVisible: teclado.sinFocoVisible.length, sinNombre: teclado.sinNombre.length, posibleTrampa: teclado.posibleTrampa },
        });
        console.log(`${id.padEnd(30)} lighthouse ${String(resultados.at(-1).lighthouse).padStart(3)}  axe ${JSON.stringify(resultados.at(-1).axe)}  ${resultados.at(-1).axeReglas.join(' ')}`);
      }
    }
  } finally {
    await contexto.close();
    fs.rmSync(perfil, { recursive: true, force: true });
  }
  return resultados;
}

const resultados = [];
for (const rol of ['estudiante', 'admin']) resultados.push(...(await medirRol(rol)));

const commit = (() => {
  try {
    return execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
})();
escribir('resumen.json', {
  tag: TAG,
  fecha: new Date().toISOString(),
  commit,
  base: BASE,
  viewport: '1440x900',
  herramientas: { 'axe-core': axeVersion, lighthouse: lighthouseVersion, chromium: chromium.name() },
  tags: TAGS_WCAG,
  mediciones: resultados.length * 2,
  resultados,
});
console.log(`sprint9-a11y-audit: ${resultados.length} combinaciones × 2 herramientas = ${resultados.length * 2} mediciones en ${salida}`);
