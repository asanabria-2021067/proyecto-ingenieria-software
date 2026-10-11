import type { Page, TestInfo } from '@playwright/test';
import { expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import type { CspCollector } from './test';

/**
 * G05 (HU-184): utilidades comunes de los E2E del calendario. Todo corre
 * contra el stack real (backend + PostgreSQL sembrado + sesión real); nada de
 * la API se simula salvo servicios de terceros (Nominatim).
 */
export const CORREO_LIDER = 'carlos.mendoza@uvg.edu.gt';
export const CORREO_INVITADA = 'maria.lopez@uvg.edu.gt';
// carlos.mendoza lidera el Proyecto 1 (seed), PUBLICADO: puede crear eventos.
export const PROYECTO = 'Plataforma de Tutorías UVG';
export const LINK = 'https://meet.google.com/e2e-hu184';

/**
 * El navegador arranca "mañana a las 08:00": el diálogo propone 09:00–10:00
 * del mismo día, siempre en el futuro para el backend (que valida con su
 * propio reloj). Solo se fija Date; los timers siguen.
 */
export function mananaTemprano(): Date {
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  manana.setHours(8, 0, 0, 0);
  return manana;
}

export async function fijarRelojMananaTemprano(page: Page): Promise<Date> {
  const manana = mananaTemprano();
  await page.clock.setFixedTime(manana);
  return manana;
}

export async function abrirNuevoEvento(page: Page, proyecto = PROYECTO) {
  await page.goto('/dashboard/calendario');
  await page.getByRole('button', { name: 'Agendar actividad' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Nuevo evento o sesión' });
  await expect(dialogo).toBeVisible();
  await dialogo.getByLabel('Proyecto', { exact: true }).click();
  await page.getByRole('option', { name: proyecto }).click();
  return dialogo;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Día del selector de fecha (calendario emergente) por su nombre accesible en
 * español ("lunes, 28 de septiembre de 2026"), que no depende del idioma del
 * navegador como sí depende el atributo `data-day`.
 */
export function diaDelSelector(page: Page, fecha: Date) {
  const nombre = new RegExp(`(^|[ ,])${fecha.getDate()} de ${MESES[fecha.getMonth()]} de ${fecha.getFullYear()}`);
  return page.locator('[data-slot="popover-content"]').getByRole('button', { name: nombre });
}

export const overflowHorizontal = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Etiqueta única por prueba: sirve de título y para limpiar solo lo que esa prueba creó. */
export function marca(testInfo: TestInfo, prefijo: string): string {
  return `${prefijo} ${Date.now()}-${testInfo.workerIndex}${testInfo.retry}`;
}

export async function idDelProyecto(page: Page, titulo = PROYECTO): Promise<number> {
  const respuesta = await page.request.get('/api/proyectos/mine');
  expect(respuesta.status()).toBe(200);
  const proyectos = (await respuesta.json()) as { idProyecto: number; tituloProyecto: string }[];
  const proyecto = proyectos.find((p) => p.tituloProyecto === titulo);
  if (!proyecto) throw new Error(`El seed no tiene el proyecto "${titulo}" para esta cuenta`);
  return proyecto.idProyecto;
}

interface EventoApi {
  idEvento: number;
  idProyecto: number;
  tituloEvento: string;
  fechaInicio: string;
  fechaFin: string;
  modalidad: string;
  linkSesion: string | null;
  ubicacionLat: number | null;
  ubicacionLng: number | null;
  ubicacionNombre: string | null;
}

/** Mis eventos (API real) cuyo título contiene `texto`, en una ventana de ±20 días alrededor de hoy. */
export async function eventosConTitulo(page: Page, texto: string): Promise<EventoApi[]> {
  const DIA = 86_400_000;
  const hoy = Date.now();
  const encontrados: EventoApi[] = [];
  // El backend acota cada consulta a 62 días: una sola ventana de 40 basta para estas pruebas.
  const desde = new Date(hoy - 5 * DIA).toISOString();
  const hasta = new Date(hoy + 35 * DIA).toISOString();
  const respuesta = await page.request.get(`/api/usuarios/me/eventos?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`);
  expect(respuesta.status()).toBe(200);
  for (const evento of (await respuesta.json()) as EventoApi[]) if (evento.tituloEvento.includes(texto)) encontrados.push(evento);
  return encontrados;
}

/** Limpieza independiente del orden y del resultado de la prueba: borra por API lo que lleve su marca. */
export async function borrarEventosConTitulo(page: Page, texto: string): Promise<number> {
  const eventos = await eventosConTitulo(page, texto);
  for (const evento of eventos) {
    const respuesta = await page.request.delete(`/api/proyectos/${evento.idProyecto}/eventos/${evento.idEvento}`);
    expect([200, 204, 404]).toContain(respuesta.status());
  }
  return eventos.length;
}

/**
 * Deuda conocida y ajena a HU-184: el mapa de ubicación (HU-169, ya en
 * develop) carga teselas de OpenStreetMap, el buscador Nominatim y los íconos
 * de Leaflet desde unpkg, que la CSP (OWASP G06, hoy en Report-Only) no
 * declara. La decisión de ampliar la CSP o alojar esos recursos no es de este
 * PR, así que NO se añade ninguna excepción a la allowlist global: las pruebas
 * que abren el mapa retiran del colector SOLO estas violaciones conocidas y
 * devuelven las que encontraron, para que quede constancia. Cualquier otra
 * violación sigue haciendo fallar la prueba.
 */
const ORIGENES_DEL_MAPA: Record<string, RegExp> = {
  'img-src': /^https:\/\/([abc]\.tile\.openstreetmap\.org|unpkg\.com)$/,
  'connect-src': /^https:\/\/nominatim\.openstreetmap\.org$/,
};

export function retirarDeudaCspDelMapa(cspViolations: CspCollector): string[] {
  const todas = cspViolations.drain();
  const ajenas = todas.filter((v) => !(ORIGENES_DEL_MAPA[v.directive]?.test(v.blocked) && v.disposition === 'report' && v.page === '/dashboard/calendario'));
  expect(ajenas, 'violaciones CSP que no son la deuda conocida del mapa').toEqual([]);
  return [...new Set(todas.map((v) => `${v.directive} ${v.blocked}`))].sort();
}

/** Captura adjunta al reporte y, si G05_EVIDENCIAS está definida, copiada a esa carpeta externa al repositorio. */
export async function capturar(page: Page, testInfo: TestInfo, nombre: string): Promise<void> {
  const destino = testInfo.outputPath(`${nombre}.png`);
  await page.screenshot({ path: destino });
  await testInfo.attach(nombre, { path: destino, contentType: 'image/png' });
  const carpeta = process.env.G05_EVIDENCIAS;
  if (carpeta) {
    fs.mkdirSync(carpeta, { recursive: true });
    fs.copyFileSync(destino, path.join(carpeta, `${nombre}.png`));
  }
}
