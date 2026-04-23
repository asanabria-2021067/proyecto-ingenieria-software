import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api/client', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '../lib/api/client';
import { login } from '../lib/services/auth';
import { createProject, getMyProjects, requestProjectClosure, searchProjects, submitProjectForReview } from '../lib/services/projects';
import { getConteoNoLeidas, getNotificaciones, marcarTodasLeidas } from '../lib/services/notifications';

describe('simulación de procesos de usuario', () => {
  it('flujo líder: login -> crear borrador -> enviar revisión -> cierre', async () => {
    (apiFetch as any)
      .mockResolvedValueOnce({ accessToken: 'jwt-1' })
      .mockResolvedValueOnce({ idProyecto: 10, estadoProyecto: 'BORRADOR', tituloProyecto: 'X' })
      .mockResolvedValueOnce({ idProyecto: 10, estadoProyecto: 'EN_REVISION' })
      .mockResolvedValueOnce({ idProyecto: 10, estadoProyecto: 'EN_SOLICITUD_CIERRE' });

    const auth = await login({ correo: 'lider@uvg.edu', contrasena: '123456' });
    const created = await createProject({ tituloProyecto: 'X' } as any);
    const submitted = await submitProjectForReview(created.idProyecto);
    const closeReq = await requestProjectClosure(submitted.idProyecto);

    expect(auth.accessToken).toBe('jwt-1');
    expect(closeReq.estadoProyecto).toBe('EN_SOLICITUD_CIERRE');
  });

  it('flujo estudiante: buscar proyectos -> ver notificaciones -> marcar leídas', async () => {
    (apiFetch as any)
      .mockResolvedValueOnce([{ idProyecto: 1, tituloProyecto: 'A' }])
      .mockResolvedValueOnce([{ idProyecto: 1 }])
      .mockResolvedValueOnce([{ idNotificacion: 1, leidaEn: null }])
      .mockResolvedValueOnce({ total: 1 })
      .mockResolvedValueOnce({ actualizadas: 1 });

    const encontrados = await searchProjects('proyecto');
    const mios = await getMyProjects();
    const notis = await getNotificaciones();
    const count = await getConteoNoLeidas();
    const done = await marcarTodasLeidas();

    expect(encontrados.length).toBe(1);
    expect(mios.length).toBe(1);
    expect(notis.length).toBe(1);
    expect(count.total).toBe(1);
    expect(done.actualizadas).toBe(1);
  });
});
