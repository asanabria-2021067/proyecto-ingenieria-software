import { test, expect } from '@playwright/test';

// Proyecto 1 "Plataforma de Tutorías UVG" viene del seed (prisma/seed.ts),
// siempre PUBLICADO. El backend solo valida cupos si el proyecto está
// EN_PROGRESO, así que cualquier rol suyo sirve sin preocuparse por cupos.
const PROYECTO_TUTORIAS_ID = 1;

// smoke: registro y postulación (T-125, flujo 1)
test('un usuario nuevo se registra, entra a proyectos, elige uno y se postula', async ({ page }) => {
  const marca = Date.now();
  const correo = `e2e.${marca}@uvg.edu.gt`;

  await page.goto('/registro');
  await page.getByPlaceholder('Juan').fill('E2E');
  await page.getByPlaceholder('Perez').fill(`Smoke${marca}`);
  await page.getByPlaceholder('24000').fill(`E2E${marca}`);
  await page.getByPlaceholder('usuario@uvg.edu.gt').fill(correo);
  await page.getByTestId('registro-carrera-select').selectOption({ index: 1 });
  await page.getByPlaceholder('Minimo 8 caracteres').fill('Passw0rd!');
  await page.getByPlaceholder('••••••••').fill('Passw0rd!');
  await page.getByRole('button', { name: 'Crear Cuenta' }).click();

  // el registro loguea automáticamente y redirige; esperamos la URL real,
  // no un tiempo fijo (el popup de éxito tarda ~1.5s antes de navegar)
  await page.waitForURL('**/dashboard');

  await page.goto('/dashboard/proyectos');
  await page
    .getByTestId(`project-card-${PROYECTO_TUTORIAS_ID}`)
    .getByRole('link', { name: 'Ver proyecto' })
    .click();
  await page.waitForURL(`**/dashboard/proyectos/${PROYECTO_TUTORIAS_ID}`);

  await page.getByRole('link', { name: /Postularme al rol/ }).first().click();
  await page.waitForURL('**/postular/**');

  await page
    .locator('textarea[name="justificacion"]')
    .fill('Tengo experiencia relevante en desarrollo frontend y quiero aportar al proyecto de tutorías.');
  await page.getByRole('button', { name: 'Enviar Postulación' }).click();

  await expect(page.getByText('¡Postulación enviada!')).toBeVisible();
});
