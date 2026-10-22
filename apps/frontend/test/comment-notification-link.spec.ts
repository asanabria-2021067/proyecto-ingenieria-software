import { describe, expect, it } from 'vitest';
import { resolveCommentNotificationLink } from '../components/notifications/comment-notification-link';

/** HU-200 (T-377/T-379): enlace directo al comentario desde la notificación. */
describe('resolveCommentNotificationLink', () => {
  it('mención en una tarea → detalle de la tarea con el comentario destacado', () => {
    expect(
      resolveCommentNotificationLink({
        tipoNotificacion: 'MENCION_COMENTARIO',
        datosJson: { idProyecto: 1, idComentario: 30, idTarea: 5, idHito: null, contexto: 'TAREA' },
      }),
    ).toBe('/dashboard/projects/1/kanban/tasks/5?section=comments&comment=30');
  });

  it('mención en un hito → pestaña Hitos del Kanban con el panel del hito', () => {
    expect(
      resolveCommentNotificationLink({
        tipoNotificacion: 'MENCION_COMENTARIO',
        datosJson: { idProyecto: 1, idComentario: 31, idTarea: null, idHito: 8 },
      }),
    ).toBe('/dashboard/projects/1/kanban?tab=hitos&hito=8&comment=31');
  });

  it('mención en el proyecto → conversación del detalle del proyecto', () => {
    expect(
      resolveCommentNotificationLink({
        tipoNotificacion: 'MENCION_COMENTARIO',
        datosJson: { idProyecto: 1, idComentario: 32, idTarea: null, idHito: null },
      }),
    ).toBe('/dashboard/proyectos/1?section=comments&comment=32');
  });

  it('los «Nuevo comentario» de tarea, hito y proyecto usan la misma regla', () => {
    const datos = { idProyecto: 2, idComentario: 7 };
    expect(
      resolveCommentNotificationLink({ tipoNotificacion: 'COMENTARIO_TAREA', datosJson: { ...datos, idTarea: 4 } }),
    ).toBe('/dashboard/projects/2/kanban/tasks/4?section=comments&comment=7');
    expect(
      resolveCommentNotificationLink({ tipoNotificacion: 'COMENTARIO_HITO', datosJson: { ...datos, idHito: 3 } }),
    ).toBe('/dashboard/projects/2/kanban?tab=hitos&hito=3&comment=7');
    expect(resolveCommentNotificationLink({ tipoNotificacion: 'COMENTARIO_PROYECTO', datosJson: datos })).toBe(
      '/dashboard/proyectos/2?section=comments&comment=7',
    );
  });

  it('sin idComentario enlaza a la sección sin destacar nada', () => {
    expect(
      resolveCommentNotificationLink({ tipoNotificacion: 'COMENTARIO_TAREA', datosJson: { idProyecto: 2, idTarea: 4 } }),
    ).toBe('/dashboard/projects/2/kanban/tasks/4?section=comments');
  });

  it('acepta ids numéricos en texto y descarta valores inválidos', () => {
    expect(
      resolveCommentNotificationLink({
        tipoNotificacion: 'MENCION_COMENTARIO',
        datosJson: { idProyecto: '3', idComentario: 'x', idTarea: '9' },
      }),
    ).toBe('/dashboard/projects/3/kanban/tasks/9?section=comments');
  });

  it('otros tipos, o sin proyecto, no producen enlace', () => {
    expect(resolveCommentNotificationLink({ tipoNotificacion: 'TAREA_ASIGNADA', datosJson: { idProyecto: 1 } })).toBeNull();
    expect(resolveCommentNotificationLink({ tipoNotificacion: 'MENCION_COMENTARIO', datosJson: { idTarea: 1 } })).toBeNull();
    expect(resolveCommentNotificationLink({ tipoNotificacion: 'MENCION_COMENTARIO', datosJson: null })).toBeNull();
  });
});
