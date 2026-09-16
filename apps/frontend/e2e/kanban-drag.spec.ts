import { test, expect, type Page } from '@playwright/test';
import { login } from './support/auth';

// carlos.mendoza es el líder del Proyecto 1 (seed), así que tiene el handle
// de arrastre en todas sus tareas sin importar a quién estén asignadas.
const CORREO_LIDER = 'carlos.mendoza@uvg.edu.gt';
const PROYECTO_ID = 1;
// Tarea sin asignar en el seed: mover esta no afecta el trabajo de nadie más.
const TITULO_TAREA = 'CRUD de sesiones de tutoría';

const ESTADOS = ['POR_HACER', 'EN_PROGRESO', 'EN_REVISION', 'HECHO'] as const;
type Estado = (typeof ESTADOS)[number];

// A diferencia del pointer drag (cíclico), el KeyboardSensor de @dnd-kit no
// da la vuelta: columnKeyboardCoordinateGetter (task-board-dnd.ts) hace
// Math.min/Math.max sobre el índice de columna, así que ArrowRight desde la
// última columna no mueve nada. Por eso el destino se elige según la
// posición real: si ya estamos en la última columna, nos movemos a la
// izquierda; si no, a la derecha. Un solo paso, siempre real.
function siguienteEstado(actual: Estado): { destino: Estado; tecla: 'ArrowRight' | 'ArrowLeft' } {
  const indice = ESTADOS.indexOf(actual);
  if (indice === ESTADOS.length - 1) {
    return { destino: ESTADOS[indice - 1], tecla: 'ArrowLeft' };
  }
  return { destino: ESTADOS[indice + 1], tecla: 'ArrowRight' };
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

// Drag real vía teclado (T-198), no simulación de API: @dnd-kit's
// PointerSensor no activa el arrastre con eventos de mouse SINTÉTICOS en
// chromium headless (confirmado: la tarjeta nunca se mueve de columna, con
// varias combinaciones de pausas/pasos — limitación conocida de simular
// pointer-based DnD bajo automatización headless, no un defecto del
// producto). El tablero YA expone una ruta de arrastre por teclado real,
// completa y accesible — KeyboardSensor con columnKeyboardCoordinateGetter
// (task-board.tsx / task-board-dnd.ts) — que dnd-kit activa con
// Space/Enter y mueve con las flechas. Usarla no es un rodeo: es el mismo
// camino que un usuario de teclado real recorre, y no depende de que el
// runner sepa fingir gestos de puntero.
async function arrastrarTarea(page: Page, handleName: string, tecla: 'ArrowRight' | 'ArrowLeft') {
  const handle = page.getByRole('button', { name: handleName });
  await handle.scrollIntoViewIfNeeded();
  // .focus() mueve el foco por DOM directamente, sin pointerdown — así el
  // PointerSensor (registrado en el mismo handle) nunca se activa por
  // accidente antes de que entre el KeyboardSensor.
  await handle.focus();
  await page.keyboard.press('Space'); // dnd-kit: activationKeys start = [Space, Enter]
  // Confirmado con 8 corridas seguidas: sin este respiro, una de cada ~8
  // corridas suelta (segundo Space) antes de que React termine de
  // confirmar la colisión recalculada por la flecha — el drag queda a
  // medias (aria-pressed sigue true, la tarea nunca cambia de columna).
  // dnd-kit recalcula la colisión de forma síncrona en el keydown de la
  // flecha, pero el estado que ese cálculo usa (`over`, expuesto por
  // aria-live) todavía no terminó de confirmarse un tick después bajo
  // chromium headless. No es un timeout arbitrario sobre el test: es el
  // hueco real entre dos pulsaciones de teclado consecutivas.
  await page.waitForTimeout(120);
  await page.keyboard.press(tecla);
  await page.waitForTimeout(120);
  await page.keyboard.press('Space'); // end = [Space, Enter] — suelta en la columna destino
}

// smoke: tablero Kanban con drag & drop real (T-125, flujo 2)
// T-198: reactivada. Estaba deshabilitada desde el Sprint 7 no por una falla
// real del producto, sino porque el gesto de arrastre se simulaba con
// page.mouse (mousedown/mousemove/mouseup) y @dnd-kit's PointerSensor no
// llega a activarse con eventos de mouse sintéticos en chromium headless
// (confirmado en su momento: la tarjeta nunca cambiaba de columna, con
// varias combinaciones de pausas/pasos). El arrastre real SÍ funciona en un
// navegador real — el defecto estaba en cómo lo ejercitaba la prueba, no en
// el tablero. En vez de subir tiempos de espera, se cambió a la ruta de
// arrastre por teclado que el tablero ya expone de forma accesible
// (KeyboardSensor + columnKeyboardCoordinateGetter, ver task-board.tsx):
// mismo resultado de negocio (la tarea cambia de columna), sin pelear con
// simulación de puntero.
test('el líder mueve una tarea a otra columna con teclado y el cambio persiste tras recargar', async ({
  page,
}) => {
  // El timeout de test por defecto (30s) manda sobre el timeout de una
  // acción individual — subir solo el de waitForURL no alcanza si el test
  // completo sigue topando a los 30s.
  test.setTimeout(60_000);
  // OnboardingTour (react-joyride) se activa por localStorage
  // (`onboarding_seen_{idUsuario}`, ver components/dashboard/OnboardingTour.tsx),
  // nunca por estado del backend: en un contexto de navegador nuevo (como
  // este test) aparece para carlos.mendoza (perfil completo) y su overlay
  // intercepta el foco/teclado igual que interceptaba el mousedown del
  // drag. Se neutraliza en la raíz en vez de perseguir el botón "Saltar
  // tour", que corre la carrera contra su retardo interno de 800ms bajo
  // carga.
  await page.addInitScript(() => {
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (typeof key === 'string' && key.startsWith('onboarding_seen_')) return 'true';
      return originalGetItem.call(this, key);
    };
  });

  await login(page, CORREO_LIDER);

  await page.goto(`/dashboard/projects/${PROYECTO_ID}/kanban`);

  const handleName = `Mover "${TITULO_TAREA}" entre estados`;
  const origen = await columnaActual(page, handleName);
  const { destino, tecla } = siguienteEstado(origen);

  await arrastrarTarea(page, handleName, tecla);

  await expect(
    page.locator(`[data-column-estado="${destino}"]`).getByRole('button', { name: handleName }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.locator(`[data-column-estado="${origen}"]`).getByRole('button', { name: handleName }),
  ).toHaveCount(0);

  // El cambio persiste tras recargar: no es solo estado optimista en el cliente.
  await page.reload();
  await expect(
    page.locator(`[data-column-estado="${destino}"]`).getByRole('button', { name: handleName }),
  ).toBeVisible({ timeout: 10_000 });

  // deja el tablero como lo encontró, para que la corrida sea repetible.
  // El movimiento de ida fue un solo paso a una columna adyacente, así que
  // la vuelta es exactamente la tecla contraria (no siguienteEstado(destino):
  // eso podría seguir avanzando en la misma dirección en vez de volver).
  const teclaVuelta = tecla === 'ArrowRight' ? 'ArrowLeft' : 'ArrowRight';
  await arrastrarTarea(page, handleName, teclaVuelta);
  await expect(
    page.locator(`[data-column-estado="${origen}"]`).getByRole('button', { name: handleName }),
  ).toBeVisible();
});
