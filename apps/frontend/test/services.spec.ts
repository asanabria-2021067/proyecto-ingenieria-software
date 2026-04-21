import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api/client', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '../lib/api/client';
import { login, register } from '../lib/services/auth';
import { getCarreras, getCualidades, getHabilidades, getIntereses } from '../lib/services/catalogs';
import {
  approveProjectClosure,
  createProject,
  getAdminReviewInbox,
  getContributorProjects,
  getMyProjectById,
  getMyProjects,
  getProjectById,
  getProjectRevisions,
  reclamarRevision,
  rejectProjectClosure,
  requestProjectClosure,
  resolverRevision,
  resubmitProject,
  searchProjects,
  submitProjectForReview,
  updateProject,
} from '../lib/services/projects';
import { getConteoNoLeidas, getNotificaciones, marcarLeida, marcarTodasLeidas } from '../lib/services/notifications';
import { addExperiencia, getDashboardStats, getMe, replaceCualidades, replaceHabilidades, replaceIntereses, updateProfile } from '../lib/services/users';

describe('frontend services wrappers', () => {
  it('auth usa endpoints correctos', async () => {
    (apiFetch as any).mockResolvedValue({});
    await login({ correo: 'a', contrasena: 'b' });
    await register({ correo: 'a', contrasena: 'b', nombre: 'n', apellido: 'a', carne: '1', idCarrera: 1, semestre: 1 });
    expect((apiFetch as any).mock.calls[0][0]).toBe('/auth/login');
    expect((apiFetch as any).mock.calls[1][0]).toBe('/auth/register');
  });

  it('projects mapea endpoints', async () => {
    (apiFetch as any).mockResolvedValue({});
    await getProjectById(1);
    await searchProjects('abc');
    await getMyProjectById(2);
    await getMyProjects();
    await getContributorProjects();
    await createProject({ tituloProyecto: 'x' } as any);
    await updateProject(1, { descripcionProyecto: 'y' } as any);
    await submitProjectForReview(1);
    await resubmitProject(1);
    await requestProjectClosure(1);
    await approveProjectClosure(1);
    await rejectProjectClosure(1);
    await getProjectRevisions(1);
    await reclamarRevision(1);
    await resolverRevision(1, { resultado: 'APROBADA' } as any);
    await getAdminReviewInbox();
    expect((apiFetch as any).mock.calls.length).toBe(16);
  });

  it('notifications/users/catalogs usan rutas esperadas', async () => {
    (apiFetch as any).mockResolvedValue({});
    await getNotificaciones();
    await getConteoNoLeidas();
    await marcarLeida(9);
    await marcarTodasLeidas();
    await getMe();
    await getDashboardStats();
    await updateProfile({ biografia: 'x' });
    await replaceHabilidades([{ idHabilidad: 1, nivelHabilidad: 'BASICO' }]);
    await replaceIntereses([1, 2]);
    await replaceCualidades([3]);
    await addExperiencia({ tituloProyectoExperiencia: 'x' });
    await getCarreras();
    await getHabilidades();
    await getIntereses();
    await getCualidades();
    expect((apiFetch as any).mock.calls.length).toBe(15);
  });
});
