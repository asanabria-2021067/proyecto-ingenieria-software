import { test, expect, type Page } from '@playwright/test';

// carlos.mendoza es el líder del Proyecto 1 (seed), así que tiene el handle
// de arrastre en todas sus tareas sin importar a quién estén asignadas.
const CORREO_LIDER = 'carlos.mendoza@uvg.edu.gt';
const CONTRASENA_LIDER = 'Test1234!';
const PROYECTO_ID = 1;
// Tarea sin asignar en el seed: mover esta no afecta el trabajo de nadie más.
const TITULO_TAREA = 'CRUD de sesiones de tutoría';

const ESTADOS = ['POR_HACER', 'EN_PROGRESO', 'EN_REVISION', 'HECHO'] as const;
type Estado = (typeof ESTADOS)[number];

function siguienteEstado(actual: Estado): Estado {
  return ESTADOS[(ESTADOS.indexOf(actual) + 1) % ESTADOS.length];
}

// No asumimos en qué columna empieza: si una corrida anterior quedó a
// medias, esto sigue encontrando la tarea donde de verdad está. Con poll:
// justo tras el goto el tablero puede seguir en su ColumnasSkeleton (fetch
// de tareas todavía en curso), así que una sola pasada síncrona puede no
// encontrar nada aunque la tarea sí esté ahí una vez cargue.
async function columnaActual(page: Page, handleName: string): Promise<Estado> {
  let encontrada: Estado | null = null;
  await expect
    .poll(
      async () => {
        for (const estado of ESTADOS) {
          const count = await page
            .locator(`[data-column-estado="${estado}"]`)
            .getByRole('button', { name: handleName })
            .count();
          if (count > 0) {
            encontrada = estado;
            return true;
          }
        }
        return false;
      },
      { timeout: 15000 },
    )
    .toBe(true);
  return encontrada as unknown as Estado;
}

// Drag real con mouse (no simulación de API): @dnd-kit activa su
// PointerSensor a los 8px de distancia y necesita varios pointermove para
// recalcular la colisión con la columna destino en cada paso.
async function arrastrarTarea(page: Page, handleName: string, destino: Estado) {
  const handle = page.getByRole('button', { name: handleName });
  const box = await handle.boundingBox();
  if (!box) throw new Error('No se pudo medir el handle de arrastre');

  const destinoBox = await page.locator(`[data-column-estado="${destino}"]`).boundingBox();
  if (!destinoBox) throw new Error('No se pudo medir la columna destino');

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // movimiento corto primero: supera el umbral de activación antes del salto grande
  await page.mouse.move(box.x + box.width / 2 + 15, box.y + box.height / 2, { steps: 5 });
  await page.mouse.move(destinoBox.x + destinoBox.width / 2, destinoBox.y + 100, { steps: 15 });
  await page.mouse.up();
}

// smoke: tablero Kanban con drag & drop real (T-125, flujo 2)
test('el líder arrastra una tarea a otra columna y el tablero refleja el cambio', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('usuario@uvg.edu.gt').fill(CORREO_LIDER);
  await page.getByPlaceholder('Minimo 8 caracteres').fill(CONTRASENA_LIDER);
  await page.getByRole('button', { name: 'Iniciar Sesion' }).click();
  await page.waitForURL('**/dashboard');

  await page.goto(`/dashboard/projects/${PROYECTO_ID}/kanban`);

  const handleName = `Mover "${TITULO_TAREA}" entre estados`;
  const origen = await columnaActual(page, handleName);
  const destino = siguienteEstado(origen);

  await arrastrarTarea(page, handleName, destino);

  await expect(
    page.locator(`[data-column-estado="${destino}"]`).getByRole('button', { name: handleName }),
  ).toBeVisible();
  await expect(
    page.locator(`[data-column-estado="${origen}"]`).getByRole('button', { name: handleName }),
  ).toHaveCount(0);

  // deja el tablero como lo encontró, para que la corrida sea repetible
  await arrastrarTarea(page, handleName, origen);
  await expect(
    page.locator(`[data-column-estado="${origen}"]`).getByRole('button', { name: handleName }),
  ).toBeVisible();
});
