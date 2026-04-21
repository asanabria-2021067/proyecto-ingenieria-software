import { describe, expect, it, vi } from 'vitest';
import { AppController } from '../src/app.controller';
import { ApplicationsController } from '../src/applications/applications.controller';
import { AuthController } from '../src/auth/auth.controller';
import { CatalogsController } from '../src/catalogs/catalogs.controller';
import { ComentariosController } from '../src/comentarios/comentarios.controller';
import { EvidenceController } from '../src/evidence/evidence.controller';
import { MensajesRevisionController } from '../src/mensajes-revision/mensajes-revision.controller';
import { NotificationsController } from '../src/notifications/notifications.controller';
import { ProjectsController } from '../src/projects/projects.controller';
import { RevisionesController } from '../src/revisiones/revisiones.controller';
import { TasksController } from '../src/tasks/tasks.controller';
import { UsersController } from '../src/users/users.controller';
import { ValidationController } from '../src/validation/validation.controller';
import { CatalogsService } from '../src/catalogs/catalogs.service';
import { EvidenceService } from '../src/evidence/evidence.service';
import { TasksService } from '../src/tasks/tasks.service';
import { ValidationService } from '../src/validation/validation.service';

describe('Controllers and basic services', () => {
  it('AppController healthCheck', () => {
    expect(new AppController().healthCheck()).toEqual({ status: 'ok' });
  });

  it('controllers delegan a sus servicios', async () => {
    const auth = new AuthController({ login: vi.fn(), register: vi.fn() } as any);
    auth.login({ correo: 'a', contrasena: 'b' } as any);
    auth.register({} as any);

    const usersSvc = {
      getMe: vi.fn(),
      getProfile: vi.fn(),
      getProfileBootstrap: vi.fn(),
      updateFotoUrl: vi.fn(),
      updateProfile: vi.fn(),
      replaceHabilidades: vi.fn(),
      replaceIntereses: vi.fn(),
      replaceCualidades: vi.fn(),
      addExperiencia: vi.fn(),
      getDashboard: vi.fn(),
    };
    const users = new UsersController(usersSvc as any);
    await users.updateProfile({ userId: 1 }, { fotoUrl: 'x' } as any);
    users.getMe({ userId: 1 });
    users.getProfile({ userId: 1 });
    users.getProfileBootstrap({ userId: 1 });
    users.getDashboard({ userId: 1 });

    const projectsSvc = {
      findAll: vi.fn(),
      findMine: vi.fn(),
      findAsContributor: vi.fn(),
      findOne: vi.fn(),
      findOneOwner: vi.fn(),
      createFull: vi.fn(),
      update: vi.fn(),
      changeEstado: vi.fn(),
      submitForReview: vi.fn(),
      resubmit: vi.fn(),
      requestClose: vi.fn(),
      approveClosure: vi.fn(),
      rejectClosure: vi.fn(),
      findPostulacionesByProject: vi.fn(),
    };
    const projects = new ProjectsController(projectsSvc as any);
    projects.findAll('q', 'ACADEMICO_HORAS_BECA', 'REMOTO', '1', '2');
    projects.findMine({ userId: 1 });
    projects.findMineLegacy({ userId: 1 });
    projects.findAsContributor({ userId: 1 });
    projects.findOne(1);
    projects.findOneOwner(1, { userId: 1 });
    projects.create({} as any, { userId: 1 });
    projects.update(1, {} as any, { userId: 1 });
    projects.changeEstado(1, { nuevoEstado: 'PUBLICADO' } as any, { userId: 1 });
    projects.submitForReview(1, { userId: 1 });
    projects.resubmit(1, { userId: 1 });
    projects.requestClose(1, { userId: 1 });
    projects.approveClosure(1, { userId: 1 });
    projects.rejectClosure(1, { userId: 1 });
    projects.findPostulaciones(1, { userId: 1 });

    const applicationsSvc = { create: vi.fn(), findAll: vi.fn(), findMine: vi.fn(), findOne: vi.fn(), updateEstado: vi.fn() };
    const applications = new ApplicationsController(applicationsSvc as any);
    applications.create({} as any);
    applications.findAll();
    applications.findMine({ userId: 1 });
    applications.findOne(1);
    applications.updateEstado(1, {} as any, { userId: 1 });

    const notificationsSvc = {
      findAll: vi.fn(),
      findUnreadForUser: vi.fn(),
      getUnreadCount: vi.fn(),
      markAllAsRead: vi.fn(),
      markAsRead: vi.fn(),
    };
    const notifications = new NotificationsController(notificationsSvc as any);
    notifications.findAll({ userId: 1 });
    notifications.findUnreadForUser({ userId: 1 });
    notifications.getUnreadCount({ userId: 1 });
    notifications.markAllAsRead({ userId: 1 });
    notifications.markAsRead(1, { userId: 1 });

    const revisiones = new RevisionesController({ findAdminInbox: vi.fn(), findByProyecto: vi.fn(), reclamar: vi.fn(), resolver: vi.fn() } as any);
    revisiones.findAdminInbox({ userId: 1 });
    revisiones.findByProyecto(1, { userId: 1 });
    revisiones.reclamar(1, { userId: 1 });
    revisiones.resolver(1, { userId: 1 }, {} as any);

    const comentarios = new ComentariosController({ create: vi.fn(), findByProyecto: vi.fn(), findByTarea: vi.fn(), findByHito: vi.fn(), update: vi.fn(), remove: vi.fn() } as any);
    comentarios.create({ userId: 1 }, {} as any);
    comentarios.findByProyecto(1);
    comentarios.findByTarea(1);
    comentarios.findByHito(1);
    comentarios.update(1, { userId: 1 }, {} as any);
    comentarios.remove(1, { userId: 1 });

    const mensajes = new MensajesRevisionController({ findByProyecto: vi.fn(), create: vi.fn(), markAsRead: vi.fn() } as any);
    mensajes.findByProyecto(1, { userId: 1 });
    mensajes.create(1, { userId: 1 }, {} as any);
    mensajes.markAsRead(1, { userId: 1 });
  });

  it('catalogs/tasks/validation/evidence servicios básicos', async () => {
    const prisma = {
      carrera: { findMany: vi.fn().mockResolvedValue([{ idCarrera: 1, nombreCarrera: 'Ing' }]) },
      habilidad: { findMany: vi.fn().mockResolvedValue([{ idHabilidad: 1, nombreHabilidad: 'TS' }]) },
      interes: { findMany: vi.fn().mockResolvedValue([{ idInteres: 1, nombreInteres: 'AI' }]) },
      cualidad: { findMany: vi.fn().mockResolvedValue([{ idCualidad: 1, nombreCualidad: 'Liderazgo' }]) },
    };
    const catalogsService = new CatalogsService(prisma as any);
    const catalogs = new CatalogsController(catalogsService);
    const result = await catalogs.findAll();
    expect(result.carreras[0].id).toBe('1');

    const tasksService = new TasksService({} as any);
    const tasks = new TasksController(tasksService);
    expect(tasks.findAll()).toEqual({ message: 'Not implemented yet' });
    expect(tasks.create({})).toEqual({ message: 'Not implemented yet' });
    expect(tasks.update(1, {})).toEqual({ message: 'Not implemented yet' });

    const validationService = new ValidationService({} as any);
    const validation = new ValidationController(validationService);
    expect(validation.findAll()).toEqual({ message: 'Not implemented yet' });
    expect(validation.create({})).toEqual({ message: 'Not implemented yet' });

    const evidenceService = new EvidenceService({} as any);
    const evidence = new EvidenceController(evidenceService);
    expect(evidence.findAll()).toEqual({ message: 'Not implemented yet' });
    expect(evidence.create({})).toEqual({ message: 'Not implemented yet' });
  });
});
