import type { APIResponse, Page } from '@playwright/test';
import { expect } from './test';

/**
 * HU-201/HU-202: utilidades de los E2E del Kanban. Cada spec crea sus propias
 * tareas por la API real con la sesión del líder (títulos únicos por
 * corrida) y las elimina al terminar, para no depender del estado del seed
 * ni dejarlo distinto de como estaba.
 */

export const CORREO_LIDER = 'carlos.mendoza@uvg.edu.gt';
export const PROYECTO_TUTORIAS = 'Plataforma de Tutorías UVG';

export type Prioridad = 'ALTA' | 'MEDIA' | 'BAJA';
export type Estado = 'POR_HACER' | 'EN_PROGRESO' | 'EN_REVISION' | 'HECHO';

export interface TareaCreada {
  idTarea: number;
  tituloTarea: string;
}

/** Misma política que el resto de la suite ante el límite de peticiones (429): reintentar sin tocar el límite. */
export async function pedir(page: Page, method: 'GET' | 'POST' | 'DELETE', ruta: string, data?: unknown): Promise<APIResponse> {
  for (let intento = 0; ; intento += 1) {
    const respuesta = await page.request.fetch(ruta, { method, data });
    if (respuesta.status() !== 429 || intento >= 12) return respuesta;
    await page.waitForTimeout(1_100);
  }
}

export async function idProyectoPorTitulo(page: Page, titulo: string): Promise<number> {
  const respuesta = await pedir(page, 'GET', '/api/proyectos/mine');
  expect(respuesta.status()).toBe(200);
  const proyectos = (await respuesta.json()) as { idProyecto: number; tituloProyecto: string }[];
  const proyecto = proyectos.find((p) => p.tituloProyecto === titulo);
  if (!proyecto) throw new Error(`El seed no tiene el proyecto «${titulo}» para esta cuenta`);
  return proyecto.idProyecto;
}

function enDias(dias: number): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

/** Crea tareas en el Sprint activo del proyecto (el hito es obligatorio: se usa el primero). */
export async function crearTareas(
  page: Page,
  idProyecto: number,
  tareas: { tituloTarea: string; prioridad: Prioridad }[],
): Promise<TareaCreada[]> {
  const detalle = await pedir(page, 'GET', `/api/proyectos/${idProyecto}`);
  expect(detalle.status()).toBe(200);
  const { hitos } = (await detalle.json()) as { hitos: { idHito: number }[] };
  expect(hitos.length, 'el proyecto del seed necesita al menos un hito').toBeGreaterThan(0);

  const creadas: TareaCreada[] = [];
  for (const tarea of tareas) {
    const respuesta = await pedir(page, 'POST', `/api/proyectos/${idProyecto}/tareas`, {
      ...tarea,
      fechaLimite: enDias(30),
      idHito: hitos[0].idHito,
    });
    expect(respuesta.status(), `crear «${tarea.tituloTarea}»`).toBe(201);
    creadas.push((await respuesta.json()) as TareaCreada);
  }
  return creadas;
}

export async function eliminarTareas(page: Page, idProyecto: number, tareas: TareaCreada[]): Promise<void> {
  for (const tarea of tareas) {
    await pedir(page, 'DELETE', `/api/proyectos/${idProyecto}/tareas/${tarea.idTarea}`);
  }
}

/** Tarjeta del Kanban por su título exacto. */
export function tarjeta(page: Page, titulo: string) {
  return page.locator('article').filter({ has: page.getByRole('button', { name: `Abrir detalles de "${titulo}"` }) });
}
