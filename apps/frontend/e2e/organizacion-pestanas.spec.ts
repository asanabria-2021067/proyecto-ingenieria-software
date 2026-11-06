import { test, expect } from './support/test';
import { login } from './support/auth';
import { API_URL, desactivarTour } from './support/realtime';

/**
 * Las pestañas de la organización viven en estado local: cambiarlas no navega
 * ni vuelve a pedir el detalle de la organización (la cabecera no se toca).
 * Solo lectura.
 */
test.describe.configure({ timeout: 60_000 });

const CARLOS = 'carlos.mendoza@uvg.edu.gt';

test('cambiar de pestaña no vuelve a pedir la organización y la URL sigue el ?tab', async ({ page }) => {
  await login(page, CARLOS);
  await desactivarTour(page);
  const respuesta = await page.request.get(`${API_URL}/api/organizaciones`);
  expect(respuesta.status()).toBe(200);
  const [organizacion] = (await respuesta.json()) as { idOrganizacion: number; nombreOrganizacion: string }[];
  test.skip(!organizacion, 'La siembra no tiene organizaciones.');

  const detalle = new RegExp(`/api/organizaciones/${organizacion.idOrganizacion}(\\?.*)?$`);
  let pedidas = 0;
  page.on('request', (r) => {
    if (r.method() === 'GET' && detalle.test(r.url())) pedidas += 1;
  });

  await page.goto(`/dashboard/organizaciones/${organizacion.idOrganizacion}?tab=portafolio`);
  await expect(page.getByRole('tab', { name: 'Portafolio' })).toHaveAttribute('aria-selected', 'true');
  const titulo = page.getByRole('heading', { level: 1, name: organizacion.nombreOrganizacion });
  await expect(titulo).toBeVisible();
  const antes = pedidas;
  expect(antes).toBeGreaterThan(0);

  await titulo.evaluate((el) => el.setAttribute('data-marca', '1'));
  for (const nombre of ['Proyectos', 'Portafolio', 'Proyectos']) {
    await page.getByRole('tab', { name: nombre }).click();
    await expect(page.getByRole('tab', { name: nombre })).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(new RegExp(`tab=${nombre.toLowerCase()}$`));
  }

  expect(pedidas, 'la cabecera no debe volver a pedir la organización').toBe(antes);
  // El mismo nodo del título sigue en el DOM: la cabecera no se remontó.
  await expect(titulo).toHaveAttribute('data-marca', '1');
});
