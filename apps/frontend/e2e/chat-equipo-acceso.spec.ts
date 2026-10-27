import { test, expect } from './support/test';
import { login } from './support/auth';
import { desactivarTour } from './support/realtime';

/**
 * IESUC-568 (B2, NeuroLab): desde la vista del proyecto hay un acceso fijo
 * «Chat del equipo» que abre el canal #general en el dock «Mensajes». Solo
 * abre la ventana; no envía mensajes.
 */

test.describe.configure({ timeout: 60_000 });

const JOSE = 'jose.ramirez@uvg.edu.gt';
const PROYECTO = 1;

// Desde md: por debajo de 768 px el dock «Mensajes» no existe (ChatDock es `hidden md:flex`).
for (const pantalla of [
  { nombre: 'escritorio (sidebar del proyecto)', width: 1440, height: 900 },
  { nombre: 'tablet (barra del proyecto)', width: 820, height: 1180 },
]) {
  test(`${pantalla.nombre}: «Chat del equipo» abre #general en el dock`, async ({ page }) => {
    await page.setViewportSize({ width: pantalla.width, height: pantalla.height });
    await desactivarTour(page);
    await login(page, JOSE);
    await page.goto(`/dashboard/proyectos/${PROYECTO}`);

    const acceso = page.getByRole('button', { name: 'Chat del equipo' }).locator('visible=true');
    await expect(acceso).toBeVisible({ timeout: 20_000 });
    await expect(acceso).toBeInViewport();
    await acceso.click();

    await expect(page.getByRole('button', { name: 'Cerrar chat' })).toBeVisible();
    await expect(page.getByText('#general').locator('visible=true').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enviar mensaje' })).toBeVisible();
  });
}
