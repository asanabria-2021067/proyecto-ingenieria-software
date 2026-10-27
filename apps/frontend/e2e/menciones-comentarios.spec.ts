import { test, expect } from './support/test';
import { login } from './support/auth';
import { desactivarTour } from './support/realtime';

// HU-200 (T-379): mencionar con @ en un comentario de tarea y recibir el aviso.
// Mismos datos sembrados que realtime-notificacion.spec.ts: carlos.mendoza
// (líder del Proyecto 1) comenta la tarea 1 ("Crear mockups en Figma") y
// menciona a maria.lopez, participante activa del proyecto. Ella recibe
// «Te mencionaron en un comentario» en vivo y, desde el centro de
// notificaciones, el enlace la lleva al comentario resaltado.
const PROYECTO_ID = 1;
const TAREA_ID = 1;
const CORREO_LIDER = 'carlos.mendoza@uvg.edu.gt';
const CORREO_MENCIONADA = 'maria.lopez@uvg.edu.gt';

test('un integrante menciona a otro con @ y este recibe el aviso con enlace al comentario', async ({ browser }) => {
  test.setTimeout(90_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await desactivarTour(pageA);
  await desactivarTour(pageB);

  try {
    await login(pageA, CORREO_LIDER);
    await login(pageB, CORREO_MENCIONADA);
    // El socket de /notifications vive en DashboardLayout: B espera en el dashboard.
    await pageB.goto('/dashboard');

    await pageA.goto(`/dashboard/projects/${PROYECTO_ID}/kanban/tasks/${TAREA_ID}?section=comments`);

    // T-376: escribir @ sugiere a los integrantes; se elige a María.
    const cuadro = pageA.getByPlaceholder('Escribe un comentario...');
    await cuadro.click();
    await cuadro.pressSequentially('Revisa esto @Mar');
    const sugerencias = pageA.getByRole('listbox', { name: 'Integrantes que puedes mencionar' });
    await expect(sugerencias).toBeVisible();
    await sugerencias.getByRole('option', { name: /María López/ }).click();
    await expect(cuadro).toHaveValue('Revisa esto @María López ');
    await expect(pageA.getByText('Se notificará a')).toBeVisible();

    const marca = `${test.info().workerIndex}-${test.info().repeatEachIndex}-${Math.random().toString(36).slice(2)}`;
    await cuadro.pressSequentially(`por favor ${marca}`);
    await pageA.getByRole('button', { name: 'Comentar', exact: true }).click();

    // T-378: en el hilo, la mención queda resaltada y enlazada al perfil.
    const comentarioA = pageA.locator('li[id^="comentario-"]', { hasText: marca });
    await expect(comentarioA).toBeVisible();
    const enlace = comentarioA.getByRole('link', { name: 'Mención a María López, ver perfil' });
    await expect(enlace).toHaveAttribute('href', /\/dashboard\/personas\/\d+$/);

    // T-377: María recibe el aviso en vivo, sin recargar.
    await expect(pageB.getByText('Te mencionaron en un comentario').first()).toBeVisible({ timeout: 15_000 });

    // Desde el centro de notificaciones: se elige el aviso en la bandeja, se lee en el visor y su acción
    // «Ver comentario» abre el comentario resaltado. La fila ya no es un enlace (bandeja de Sprint 10).
    await pageB.goto('/dashboard/notificaciones');
    const fila = pageB
      .getByRole('region', { name: 'Bandeja de entrada' })
      .locator('li[data-notificacion]', { hasText: 'Te mencionaron en un comentario' })
      .first();
    await fila.getByRole('button').click();
    const visor = pageB.getByRole('article');
    await expect(visor.getByRole('heading', { level: 3 })).toHaveText('Te mencionaron en un comentario');
    await visor.getByRole('link', { name: 'Ver comentario' }).click();
    await pageB.waitForURL(
      new RegExp(`/dashboard/projects/${PROYECTO_ID}/kanban/tasks/${TAREA_ID}\\?section=comments&comment=\\d+`),
    );

    const comentarioB = pageB.locator('li[id^="comentario-"]', { hasText: marca });
    await expect(comentarioB).toBeVisible();
    // El aviso abierto lleva a este comentario y no a otro: el id de la URL es el del comentario con la marca.
    const idComentario = new URL(pageB.url()).searchParams.get('comment');
    await expect(comentarioB).toHaveAttribute('id', `comentario-${idComentario}`);
    await expect(comentarioB).toHaveClass(/comment-spotlight/);
    await expect(comentarioB.getByRole('link', { name: 'Mención a ti (María López), ver perfil' })).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
