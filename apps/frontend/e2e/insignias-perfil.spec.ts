import type { APIResponse, Page } from '@playwright/test';
import { test, expect } from './support/test';
import { login } from './support/auth';
import { API_URL, desactivarTour } from './support/realtime';

/**
 * HU-190 (T-349): una acción real (comentar una tarea) hace que el backend
 * otorgue la insignia «Comentarios en tareas» y aparezca en el perfil, sin
 * simular nada. Es incremental: lee el avance actual y comenta lo justo para
 * subir al siguiente nivel, así que sirve en cualquier corrida.
 */

const CARLOS = 'carlos.mendoza@uvg.edu.gt';
const API = `${API_URL}/api`;
const PROYECTO = 1;
const TAREA = 2;

interface Insignia {
  clave: string;
  nivel: string | null;
  progreso: number;
  siguienteUmbral: number | null;
}

/** El backend limita peticiones por IP: ante un 429 se espera y se repite. */
async function conReintento(page: Page, pedir: () => Promise<APIResponse>): Promise<APIResponse> {
  for (let intento = 0; ; intento += 1) {
    const respuesta = await pedir();
    if (respuesta.status() !== 429 || intento >= 12) return respuesta;
    await page.waitForTimeout(1_100);
  }
}

async function comentarios(page: Page): Promise<Insignia> {
  const respuesta = await conReintento(page, () => page.request.get(`${API}/insignias/me`));
  expect(respuesta.status()).toBe(200);
  return ((await respuesta.json()) as Insignia[]).find((i) => i.clave === 'comentarios')!;
}

test('una insignia nueva aparece en el perfil tras la acción que la otorga', async ({ page }) => {
  test.setTimeout(180_000);
  await desactivarTour(page);
  await login(page, CARLOS);

  const antes = await comentarios(page);
  // Se omite si la insignia ya está en el nivel máximo: no hay umbral siguiente que alcanzar.
  test.skip(antes.siguienteUmbral === null, 'La insignia ya está en Diamante: no hay nivel nuevo que provocar.');

  const faltan = antes.siguienteUmbral! - antes.progreso;
  for (let i = 0; i < faltan; i += 1) {
    const r = await conReintento(page, () =>
      page.request.post(`${API}/proyectos/${PROYECTO}/tareas/${TAREA}/comentarios`, {
        data: { contenido: `Comentario de prueba de insignias ${Date.now()}-${i}` },
      }),
    );
    expect(r.status(), 'crear comentario de tarea').toBe(201);
  }

  // El otorgamiento es asíncrono: se espera a que la API refleje el nivel nuevo.
  await expect
    .poll(async () => (await comentarios(page)).nivel, { timeout: 30_000 })
    .not.toBe(antes.nivel);
  const despues = await comentarios(page);

  await page.goto('/dashboard/perfil');
  const seccion = page.getByRole('region', { name: 'Insignias' });
  await expect(seccion).toBeVisible();
  const nombreNivel = { BRONCE: 'Bronce', PLATA: 'Plata', ORO: 'Oro', DIAMANTE: 'Diamante' }[despues.nivel!];
  const insignia = seccion.getByRole('button', { name: `Comentarios en tareas, nivel ${nombreNivel}` });
  await expect(insignia).toBeVisible();

  // El nivel se lee en texto y el popover abre con el teclado.
  await insignia.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog').getByText(`Nivel actual: ${nombreNivel}`)).toBeVisible();
});
