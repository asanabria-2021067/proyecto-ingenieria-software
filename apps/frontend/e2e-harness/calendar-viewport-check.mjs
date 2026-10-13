#!/usr/bin/env node
/**
 * G05-C13 — arnés de evidencia del calendario (viewport × tema + axe opcional).
 *
 * No es una prueba de la suite (Playwright no recoge archivos .mjs sin "spec"
 * ni "test" en el nombre). Hace dos cosas contra un stack YA levantado y
 * desechable (frontend + backend + PostgreSQL sembrado):
 *
 *   1. Ejecuta e2e/calendario-accesibilidad.spec.ts con G05_EVIDENCIAS, para
 *      que ese spec (la única fuente de las mediciones) guarde sus tablas
 *      viewport × tema y sus capturas en la carpeta indicada.
 *   2. Si `axe-core` se puede resolver, lo ejecuta sobre las vistas y los
 *      diálogos y guarda el resultado clasificado. axe-core NO es dependencia
 *      directa del proyecto (decisión P-5 pendiente): este script no la añade
 *      y, si no está, lo dice y termina igual.
 *
 * Uso:   node e2e-harness/calendar-viewport-check.mjs --out <carpeta fuera del repositorio>
 * Entorno: PLAYWRIGHT_BASE_URL (obligatoria, debe ser local).
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argumento = process.argv.indexOf('--out');
const salida = argumento > 0 ? path.resolve(process.argv[argumento + 1] ?? '') : '';
const base = process.env.PLAYWRIGHT_BASE_URL ?? '';

function terminar(mensaje) {
  console.error(`calendar-viewport-check: ${mensaje}`);
  process.exit(2);
}
if (!salida) terminar('falta --out <carpeta>');
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) terminar('PLAYWRIGHT_BASE_URL debe apuntar a un stack local desechable (localhost o 127.0.0.1)');
// La evidencia nunca se escribe dentro del repositorio (capturas y tablas no se versionan).
const raizGit = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: frontend, encoding: 'utf8' }).stdout.trim();
if (raizGit && !path.relative(raizGit, salida).startsWith('..')) terminar(`--out debe estar fuera del repositorio (${raizGit})`);
fs.mkdirSync(salida, { recursive: true });

// 1) Mediciones propias: las del spec versionado.
const corrida = spawnSync('npx', ['playwright', 'test', 'e2e/calendario-accesibilidad.spec.ts', '--workers=1', '--reporter=line'], {
  cwd: frontend,
  stdio: 'inherit',
  env: { ...process.env, G05_EVIDENCIAS: salida },
});
const resumen = { generado: new Date().toISOString(), base, specAccesibilidad: corrida.status === 0 ? 'PASS' : `FAIL (código ${corrida.status})`, axe: 'no ejecutado' };

// 2) axe-core, solo si ya está instalado de forma transitiva.
const require = createRequire(path.join(frontend, 'package.json'));
let rutaAxe = '';
try {
  rutaAxe = require.resolve('axe-core/axe.min.js');
} catch {
  resumen.axe = 'axe-core no está disponible en node_modules: no se ejecutó (no es dependencia directa del proyecto)';
}

if (rutaAxe) {
  const { chromium } = require('@playwright/test');
  const fuente = fs.readFileSync(rutaAxe, 'utf8');
  const navegador = await chromium.launch();
  const hallazgos = [];
  try {
    for (const tema of ['light', 'dark']) {
      for (const [ancho, alto] of [[375, 900], [1440, 900]]) {
        const contexto = await navegador.newContext({ viewport: { width: ancho, height: alto }, colorScheme: tema, baseURL: base });
        const pagina = await contexto.newPage();
        // Sesión real por el formulario, con la cuenta sintética del seed (misma que e2e/support/auth.ts).
        await pagina.goto('/login');
        await pagina.getByPlaceholder('usuario@uvg.edu.gt').fill('carlos.mendoza@uvg.edu.gt');
        await pagina.getByPlaceholder('Minimo 8 caracteres').fill('Test1234!');
        await pagina.getByRole('button', { name: 'Iniciar Sesion' }).click();
        await pagina.waitForURL('**/dashboard', { timeout: 45_000 });
        await pagina.goto('/dashboard/calendario');
        const analizar = async (superficie, selector) => {
          await pagina.waitForTimeout(500);
          await pagina.evaluate(fuente);
          const violaciones = await pagina.evaluate(async (sel) => {
            const raiz = document.querySelector(sel) ?? document;
            const resultado = await window.axe.run(raiz, { resultTypes: ['violations'] });
            return resultado.violations.map((v) => ({ regla: v.id, impacto: v.impact, nodos: v.nodes.length, ejemplo: v.nodes[0]?.html.slice(0, 160), resumen: v.nodes[0]?.failureSummary?.split('\n').slice(0, 2).join(' ').slice(0, 220) }));
          }, selector);
          hallazgos.push({ tema, ancho, superficie, violaciones });
        };
        for (const vista of ['Semana', 'Día', 'Mes']) {
          await pagina.getByRole('radio', { name: vista }).click();
          await analizar(vista, 'main');
        }
        await pagina.getByRole('button', { name: 'Agendar actividad' }).click();
        await pagina.getByRole('dialog', { name: 'Nuevo evento o sesión' }).waitFor();
        await analizar('diálogo crear', '[role="dialog"]');
        await pagina.keyboard.press('Escape');
        await pagina.getByRole('button', { name: 'Compartir agenda' }).click();
        await pagina.getByRole('dialog', { name: 'Compartir mi agenda' }).waitFor();
        await analizar('diálogo compartir', '[role="dialog"]');
        await contexto.close();
        // El inicio de sesión está limitado a 5 por minuto e IP: se espacian las cuatro sesiones.
        await new Promise((resolver) => setTimeout(resolver, 15_000));
      }
    }
  } finally {
    await navegador.close();
  }
  const graves = hallazgos.flatMap((h) => h.violaciones.filter((v) => v.impacto === 'serious' || v.impacto === 'critical').map((v) => `${h.tema}-${h.ancho}-${h.superficie}: ${v.regla}×${v.nodos}`));
  fs.writeFileSync(path.join(salida, 'axe.json'), JSON.stringify(hallazgos, null, 1));
  resumen.axe = {
    superficies: hallazgos.length,
    serias: graves,
    nota: 'axe calcula mal el contraste del texto sobre bloques de evento coloreados y con opacidad; cada color-contrast debe contrastarse con c13-tabla-*.json, que mide el fondo realmente compuesto. main incluye la cabecera general de la aplicación, que no es del calendario.',
  };
}

fs.writeFileSync(path.join(salida, 'calendar-viewport-check.json'), JSON.stringify(resumen, null, 1));
console.log(JSON.stringify(resumen, null, 1));
process.exit(corrida.status === 0 ? 0 : 1);
