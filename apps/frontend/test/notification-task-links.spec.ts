import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { resolveTaskNotificationLink } from '../components/notifications/task-notification-link';

describe('resolveTaskNotificationLink', () => {
  it('resuelve TAREA_ASIGNADA con projectId/taskId (forma real de tasks.service.ts)', () => {
    expect(
      resolveTaskNotificationLink({
        tipoNotificacion: 'TAREA_ASIGNADA',
        datosJson: { projectId: 12, taskId: 34 },
      }),
    ).toBe('/dashboard/projects/12/kanban/tasks/34');
  });

  it('resuelve TAREA_ACTUALIZADA igual que TAREA_ASIGNADA', () => {
    expect(
      resolveTaskNotificationLink({
        tipoNotificacion: 'TAREA_ACTUALIZADA',
        datosJson: { projectId: 5, taskId: 9 },
      }),
    ).toBe('/dashboard/projects/5/kanban/tasks/9');
  });

  it('acepta idProyecto/idTarea como convención alternativa', () => {
    expect(
      resolveTaskNotificationLink({
        tipoNotificacion: 'TAREA_ASIGNADA',
        datosJson: { idProyecto: 7, idTarea: 2 },
      }),
    ).toBe('/dashboard/projects/7/kanban/tasks/2');
  });

  it('sin taskId construye el enlace solo con projectId (abre el workspace sin enfocar tarea)', () => {
    expect(
      resolveTaskNotificationLink({
        tipoNotificacion: 'TAREA_ASIGNADA',
        datosJson: { projectId: 12 },
      }),
    ).toBe('/dashboard/projects/12/kanban');
  });

  it('resuelve ROL_ABANDONADO al workspace Kanban (sin taskId, consolidada)', () => {
    expect(
      resolveTaskNotificationLink({
        tipoNotificacion: 'ROL_ABANDONADO',
        datosJson: { projectId: 42, roleId: 3, taskCount: 2 },
      }),
    ).toBe('/dashboard/projects/42/kanban');
  });

  it('sin projectId no resuelve enlace (no se puede navegar sin proyecto)', () => {
    expect(
      resolveTaskNotificationLink({ tipoNotificacion: 'TAREA_ASIGNADA', datosJson: { taskId: 3 } }),
    ).toBeNull();
  });

  it('sin datosJson no resuelve enlace', () => {
    expect(
      resolveTaskNotificationLink({ tipoNotificacion: 'TAREA_ASIGNADA', datosJson: null }),
    ).toBeNull();
  });

  it('tipos de notificación no relacionados con tareas no resuelven enlace (delegan a getNotificationLink)', () => {
    expect(
      resolveTaskNotificationLink({
        tipoNotificacion: 'NUEVA_POSTULACION',
        datosJson: { projectId: 1 },
      }),
    ).toBeNull();
  });

  it('ignora un projectId con formato inválido (no numérico, cero o negativo)', () => {
    expect(
      resolveTaskNotificationLink({
        tipoNotificacion: 'TAREA_ASIGNADA',
        datosJson: { projectId: 'no-es-numero' },
      }),
    ).toBeNull();
    expect(
      resolveTaskNotificationLink({ tipoNotificacion: 'TAREA_ASIGNADA', datosJson: { projectId: 0 } }),
    ).toBeNull();
  });
});

// Integración con la campanita de notificaciones: verifica que el enlace
// calculado realmente se usa como `href`, sin inventar la URL en el propio
// componente ni tocar lib/services/notifications.ts (protegido).
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
});

vi.mock('../hooks/use-notifications', () => ({
  useNotificaciones: vi.fn(),
  useConteoNoLeidas: vi.fn(),
  useMarcarLeida: vi.fn(),
  useMarcarTodasLeidas: vi.fn(),
}));

import { NotificationsBell } from '../components/layout/notifications-bell';
import {
  useConteoNoLeidas,
  useMarcarLeida,
  useMarcarTodasLeidas,
  useNotificaciones,
} from '../hooks/use-notifications';

describe('NotificationsBell — enlaces de notificaciones de tarea', () => {
  afterEach(() => cleanup());

  function mockHooks(notificaciones: unknown[]) {
    (useNotificaciones as any).mockReturnValue({ data: notificaciones });
    (useConteoNoLeidas as any).mockReturnValue({ data: { total: notificaciones.length } });
    (useMarcarLeida as any).mockReturnValue({ mutate: vi.fn(), isPending: false });
    (useMarcarTodasLeidas as any).mockReturnValue({ mutate: vi.fn(), isPending: false });
  }

  it('una notificación TAREA_ASIGNADA con datosJson completo enlaza al tablero del proyecto', () => {
    mockHooks([
      {
        idNotificacion: 1,
        tipoNotificacion: 'TAREA_ASIGNADA',
        tituloNotificacion: 'Nueva tarea asignada',
        mensajeNotificacion: null,
        datosJson: { projectId: 12, taskId: 34 },
        // Fecha reciente: el panel (`filtrarRecientes`) solo lista las
        // notificaciones de los últimos 2 días.
        creadaEn: new Date().toISOString(),
        leidaEn: null,
      },
    ]);

    render(createElement(NotificationsBell));
    fireEvent.click(screen.getByRole('button', { name: /Notificaciones/ }));

    const enlace = screen.getByRole('link', { name: /Nueva tarea asignada/ });
    expect(enlace).toHaveAttribute('href', '/dashboard/projects/12/kanban/tasks/34');
  });

  it('una notificación de tarea sin projectId no se renderiza como enlace', () => {
    mockHooks([
      {
        idNotificacion: 2,
        tipoNotificacion: 'TAREA_ACTUALIZADA',
        tituloNotificacion: 'Ya no estás asignado',
        mensajeNotificacion: null,
        datosJson: {},
        creadaEn: new Date().toISOString(),
        leidaEn: null,
      },
    ]);

    render(createElement(NotificationsBell));
    fireEvent.click(screen.getByRole('button', { name: /Notificaciones/ }));

    expect(screen.queryByRole('link', { name: /Ya no estás asignado/ })).not.toBeInTheDocument();
    expect(screen.getByText('Ya no estás asignado')).toBeInTheDocument();
  });
});
