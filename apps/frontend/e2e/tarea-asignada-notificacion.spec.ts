import { test, expect } from './support/test';
import { login } from './support/auth';
import { desactivarTour } from './support/realtime';
import { crearTareas, eliminarTareas, idProyectoPorTitulo, pedir, PROYECTO_TUTORIAS, CORREO_LIDER } from './support/kanban';

// NL-T4: desde el aviso de tarea asignada se llega al detalle en un clic y desde
// ahí se registran horas. Dos contextos reales, como realtime-notificacion.spec.ts.
const CORREO_ASIGNADA = 'maria.lopez@uvg.edu.gt';

test('el aviso de tarea asignada abre el detalle con «Ver mi tarea» y permite registrar horas', async ({ browser }) => {
  test.setTimeout(90_000);
  const contextoLider = await browser.newContext();
  const contextoAsignada = await browser.newContext();
  const paginaLider = await contextoLider.newPage();
  const paginaAsignada = await contextoAsignada.newPage();
  await desactivarTour(paginaLider);
  await desactivarTour(paginaAsignada);

  const marca = `${test.info().workerIndex}-${Math.random().toString(36).slice(2, 8)}`;
  let idProyecto = 0;
  let tareas: Awaited<ReturnType<typeof crearTareas>> = [];

  try {
    await login(paginaLider, CORREO_LIDER);
    await login(paginaAsignada, CORREO_ASIGNADA);
    // Se queda en el dashboard: el socket de notificaciones vive en DashboardLayout.
    await paginaAsignada.goto('/dashboard');
    // El aviso llega por socket: asignar antes de que conecte lo perdería.
    await expect(paginaAsignada.getByRole('status', { name: 'Notificaciones en vivo conectadas' })).toBeVisible();

    idProyecto = await idProyectoPorTitulo(paginaLider, PROYECTO_TUTORIAS);
    tareas = await crearTareas(paginaLider, idProyecto, [{ tituloTarea: `NL-T4 ${marca}`, prioridad: 'MEDIA' }]);

    const yo = await pedir(paginaAsignada, 'GET', '/api/usuarios/me');
    expect(yo.status()).toBe(200);
    const { idUsuario } = (await yo.json()) as { idUsuario: number };
    const asignar = await paginaLider.request.post(`/api/proyectos/${idProyecto}/tareas/${tareas[0].idTarea}/asignar`, {
      data: { idUsuario },
    });
    expect(asignar.ok(), 'asignar la tarea').toBeTruthy();

    // Un solo clic desde el aviso: detalle de la tarea.
    await paginaAsignada.getByRole('button', { name: 'Ver mi tarea' }).click({ timeout: 15_000 });
    await expect(paginaAsignada).toHaveURL(new RegExp(`/dashboard/projects/${idProyecto}/kanban/tasks/${tareas[0].idTarea}(\\?|$)`));
    await expect(paginaAsignada.getByRole('heading', { name: 'Horas de la tarea' })).toBeVisible();
    await expect(paginaAsignada.getByRole('form', { name: 'Registrar horas' })).toBeVisible();
  } finally {
    await eliminarTareas(paginaLider, idProyecto, tareas);
    await contextoLider.close();
    await contextoAsignada.close();
  }
});